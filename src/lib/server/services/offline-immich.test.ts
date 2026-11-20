import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Command } from '../../commands/commands';
import { registerFirstAdmin, type AuthUser } from '../auth/accounts';
import { hashPassword, verifyPassword } from '../auth/password';
import type { Clock } from '../clock';
import { createDrizzleAccountRepository } from '../db/account-repository';
import * as schema from '../db/schema';
import { dispatchCommand, type CommandActor } from '../domain/commands/dispatch';
import type { IdGenerator } from '../id';
import { createServices, type AppServices } from './app-services';
import type { AuthConfig } from './auth';

/*
 * The composer's Immich picks through the command path (docs/dev/04 ADR-132), over a real in-memory
 * SQLite and the demo Immich: a moment or a journal-page entry sent with the picker's tokens
 * refers to the photos, and a refused token writes nothing.
 */

const clock: Clock = { now: () => Date.UTC(2026, 9, 8, 9) };
let counter = 0;
const ids: IdGenerator = { next: () => `id-${++counter}` };
const ASSET = '11111111-1111-4111-8111-111111111111';

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

let db: BunSQLiteDatabase<typeof schema>;
let services: AppServices;
let actor: CommandActor;
let annaId: string;

async function servicesWith(immich: boolean): Promise<void> {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	const admin: AuthUser = await registerFirstAdmin(
		{ accounts: createDrizzleAccountRepository(db), ids, hashPassword, verifyPassword },
		{
			householdName: 'Pollari',
			email: 'andy@example.test',
			name: 'Andy',
			password: 'correct horse battery',
			locale: 'en'
		}
	);
	services = createServices({
		config: {
			...config,
			immich: immich ? { mode: 'demo', publicUrl: 'https://photos.example.test' } : null,
			nextcloud: null,
			sessionSecret: 'a-session-secret',
			updateCheck: false,
			updateFeedUrl: '',
			mediaDir: '/nonexistent/stella-media'
		},
		db,
		sqlite,
		clock,
		ids,
		version: '1.0.0'
	});
	actor = { userId: admin.id, householdId: admin.householdId, locale: 'en' };
	const added = await dispatchCommand(services.offline.commandDeps, actor, {
		id: 'cmd-anna',
		type: 'contact.add',
		payload: {
			firstName: 'Anna',
			lastName: 'Pollari',
			nickname: '',
			description: '',
			howWeMet: '',
			metPlace: '',
			birthDate: '',
			birthYearEstimate: '',
			gender: null,
			visibility: 'shared',
			isSelf: false
		},
		issuedAt: clock.now()
	});
	if (added.status !== 'applied') throw new Error('Anna was not added');
	annaId = added.result.contactId;
}

const signedPick = (householdId = actor.householdId) =>
	services.immich!.signer.sign({ kind: 'library', householdId, assetId: ASSET, size: 'thumbnail' });

const entry = (immichTokens: string[]): Command => ({
	id: 'cmd-entry',
	type: 'journal.write',
	payload: {
		contactId: annaId,
		entryDate: '2026-10-07',
		title: null,
		body: 'At the lake',
		visibility: 'shared',
		immichTokens
	},
	issuedAt: clock.now()
});

const references = () =>
	db
		.select({
			journalEntryId: schema.journalImmichPhoto.journalEntryId,
			assetId: schema.journalImmichPhoto.assetId
		})
		.from(schema.journalImmichPhoto)
		.all();

describe('the composer’s Immich picks through the command path', () => {
	beforeEach(() => servicesWith(true));

	it('a journal-page entry refers to the picked photo, copying nothing', async () => {
		const outcome = await dispatchCommand(
			services.offline.commandDeps,
			actor,
			entry([await signedPick()])
		);
		expect(outcome.status).toBe('applied');
		const [written] = db.select({ id: schema.journalEntry.id }).from(schema.journalEntry).all();
		expect(references()).toEqual([{ journalEntryId: written!.id, assetId: ASSET }]);
		expect(db.select().from(schema.photo).all()).toEqual([]);
	});

	it('a moment refers to the picked photo from the entry it landed in', async () => {
		const outcome = await dispatchCommand(services.offline.commandDeps, actor, {
			id: 'cmd-moment',
			type: 'moment.capture',
			payload: {
				body: 'Swimming',
				entryDate: '2026-10-07',
				visibility: 'shared',
				newPeople: [],
				anchorId: annaId,
				immichTokens: [await signedPick()]
			},
			issuedAt: clock.now()
		});
		expect(outcome.status).toBe('applied');
		if (outcome.status !== 'applied') return;
		expect(references()).toEqual([{ journalEntryId: outcome.result.entryId, assetId: ASSET }]);
	});

	it('refuses a token of another household and writes no entry', async () => {
		const outcome = await dispatchCommand(
			services.offline.commandDeps,
			actor,
			entry([await signedPick('another-household')])
		);
		expect(outcome.status).toBe('refused');
		expect(db.select().from(schema.journalEntry).all()).toEqual([]);
	});
});

describe('the composer’s Immich picks without Immich on the instance', () => {
	beforeEach(() => servicesWith(false));

	it('refuses the entry rather than drop its photos', async () => {
		const outcome = await dispatchCommand(services.offline.commandDeps, actor, entry(['a.b']));
		expect(outcome.status).toBe('refused');
		expect(db.select().from(schema.journalEntry).all()).toEqual([]);
	});
});
