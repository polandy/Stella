import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerFirstAdmin, type AuthUser } from '../auth/accounts';
import { hashPassword, verifyPassword } from '../auth/password';
import type { Clock } from '../clock';
import { createDrizzleAccountRepository } from '../db/account-repository';
import { createDrizzleContactRepository } from '../db/contact-repository';
import * as schema from '../db/schema';
import { exportHousehold, serialiseDocument } from '../domain/archive/archive';
import { importArchive } from '../domain/archive/import';
import { createContact } from '../domain/contacts/contacts';
import type { IdGenerator } from '../id';
import { createFileMediaStore } from '../media/file-store';
import { createServices } from './app-services';
import { createArchiveServices, type ArchiveWiring } from './archive';
import { createGiftServices } from './gifts';
import type { AuthConfig } from './auth';

/*
 * The archive group of the composition root (docs/08 §8.3), built over a real in-memory
 * SQLite and a media directory on disk: what the edge gets from `locals.services.archive`
 * must work end to end — an archive exported through it restores through it, and the restore
 * writes its images into the one media store.
 */

const clock: Clock = { now: () => Date.UTC(2026, 9, 8, 9) };
let counter = 0;
const ids: IdGenerator = { next: () => `id-${++counter}` };

let sqlite: Database;
let db: BunSQLiteDatabase<typeof schema>;
let mediaDir: string;
let wiring: ArchiveWiring;
let admin: AuthUser;

beforeEach(async () => {
	counter = 0;
	sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	mediaDir = await mkdtemp(join(tmpdir(), 'stella-archive-services-'));
	admin = await registerFirstAdmin(
		{ accounts: createDrizzleAccountRepository(db), ids, hashPassword, verifyPassword },
		{
			householdName: 'Pollari',
			email: 'andy@example.test',
			name: 'Andy',
			password: 'correct horse battery',
			locale: 'en'
		}
	);
	wiring = {
		db,
		sqlite,
		clock,
		ids,
		media: createFileMediaStore(mediaDir),
		convertHeldGifts: createGiftServices({
			db,
			clock,
			ids,
			contacts: createDrizzleContactRepository(db)
		}).convertHeldGifts
	};
});

afterEach(async () => {
	await rm(mediaDir, { recursive: true, force: true });
});

const actorOf = (user: AuthUser) => ({ userId: user.id, householdId: user.householdId });

async function addPerson(firstName: string) {
	return createContact(
		{ contacts: createDrizzleContactRepository(db), ids, clock },
		{
			userId: admin.id,
			householdId: admin.householdId,
			defaultVisibility: 'shared',
			locale: 'en'
		},
		{ firstName, lastName: 'Pollari' }
	);
}

describe('createArchiveServices', () => {
	it('restores into the media store it was handed', () => {
		const archive = createArchiveServices(wiring);
		expect(archive.importArchiveDeps.media).toBe(wiring.media);
	});

	it('exports the household and restores the archive back into it', async () => {
		const archive = createArchiveServices(wiring);
		await addPerson('Anna');

		const exported = await exportHousehold(archive.archiveDeps, actorOf(admin));
		expect(exported.fileName).toContain('stella');
		const report = await importArchive(
			archive.importArchiveDeps,
			actorOf(admin),
			{
				documentText: serialiseDocument(exported.document),
				media: new Map([['restored/photo.jpg', new Uint8Array([1, 2, 3])]])
			},
			'en'
		);

		// The same household again: Anna is already here, so nothing is written twice.
		expect(report.household).toBe('Pollari');
		expect(report.skipped.contact).toBe(1);
		expect(report.added.contact ?? 0).toBe(0);
	});
});

describe('restoring an archive from before gift records', () => {
	it('makes gifts of its gift notes and gift touchpoints, on their old days', async () => {
		const archive = createArchiveServices(wiring);
		const anna = await addPerson('Anna');
		const ben = await addPerson('Ben');
		db.insert(schema.note)
			.values({
				id: 'monica:gift:7',
				contactId: anna,
				createdBy: admin.id,
				title: 'Gift',
				body: '🎁 **Teapot** — offered, 12 October 2023\n\nCast iron',
				createdAt: 1_000,
				updatedAt: 1_000
			})
			.run();
		db.insert(schema.interaction)
			.values({
				id: 'touch-1',
				contactId: anna,
				createdBy: admin.id,
				kind: 'gift' as 'other',
				title: 'Birthday wine',
				happenedAt: '2024-05-02'
			})
			.run();
		db.insert(schema.interactionParticipant)
			.values({ interactionId: 'touch-1', contactId: ben })
			.run();
		const exported = await exportHousehold(archive.archiveDeps, actorOf(admin));
		// The household lost them since; the older archive brings them back.
		db.delete(schema.note).run();
		db.delete(schema.interaction).run();

		const report = await importArchive(
			archive.importArchiveDeps,
			actorOf(admin),
			{ documentText: serialiseDocument(exported.document), media: new Map() },
			'en'
		);

		expect(report.warnings).toContainEqual({ code: 'giftsConverted', count: 3 });
		const gifts = db
			.select({
				id: schema.gift.id,
				contactId: schema.gift.contactId,
				state: schema.gift.state,
				title: schema.gift.title,
				givenOn: schema.gift.givenOn
			})
			.from(schema.gift)
			.orderBy(schema.gift.id)
			.all();
		expect(gifts).toEqual([
			{
				id: 'monica:gift:7',
				contactId: anna,
				state: 'given',
				title: 'Teapot',
				givenOn: '2023-10-12'
			},
			{
				id: 'touch-1',
				contactId: anna,
				state: 'given',
				title: 'Birthday wine',
				givenOn: '2024-05-02'
			},
			{
				id: `touch-1:${ben}`,
				contactId: ben,
				state: 'given',
				title: 'Birthday wine',
				givenOn: '2024-05-02'
			}
		]);
		expect(db.select().from(schema.note).all()).toEqual([]);
		expect(db.select().from(schema.interaction).all()).toEqual([]);
	});
});

describe('createServices', () => {
	it('groups the archive context under `archive`, over the media context’s store', () => {
		const config: AuthConfig = {
			url: 'https://stella.example.test',
			auth: { local: true, oidc: false },
			oidc: {
				issuer: '',
				clientId: '',
				clientSecret: '',
				redirectUri: '',
				scopes: 'openid',
				providerName: 'authelia',
				allowedGroups: [],
				adminGroups: [],
				allowedEmails: [],
				jitProvision: false,
				linkByEmail: false,
				syncRoles: false,
				syncProfile: false,
				rpLogout: false
			}
		};
		const services = createServices({
			config: {
				...config,
				immich: null,
				sessionSecret: 'a-session-secret',
				updateCheck: false,
				updateFeedUrl: '',
				mediaDir
			},
			db,
			sqlite,
			clock,
			ids,
			version: '1.0.0'
		});
		expect(services.archive.importArchiveDeps.media).toBe(services.media.store);
		expect(services.archive.importDeps.clock).toBe(clock);
	});
});
