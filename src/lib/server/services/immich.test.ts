import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { registerFirstAdmin, type AuthUser } from '../auth/accounts';
import { hashPassword, verifyPassword } from '../auth/password';
import type { Clock } from '../clock';
import { createDrizzleAccountRepository } from '../db/account-repository';
import { createDrizzleContactRepository } from '../db/contact-repository';
import { createDrizzlePersonContextReads } from '../db/person-context-reads';
import * as schema from '../db/schema';
import type { AvatarDeps } from '../domain/media/avatars';
import { addPersonFromImmich } from '../domain/immich/add-from-immich';
import { readImmichLink } from '../domain/immich/links';
import type { IdGenerator } from '../id';
import { DEMO_PUBLIC_URL } from '../immich/config';
import { createServices } from './app-services';
import type { AuthConfig } from './auth';
import { createImmichServices, type ImmichWiring } from './immich';

/*
 * The immich group of the composition root (docs/08 §8.3), built over a real in-memory SQLite
 * and the demo's in-memory Immich: what the edge gets from `locals.services.immich` must work
 * end to end — a person added from a face is linked through the one link repository every
 * other Immich deps reads — and without a configured Immich the whole group is null.
 */

const clock: Clock = { now: () => Date.UTC(2026, 9, 8, 9) };
let counter = 0;
const ids: IdGenerator = { next: () => `id-${++counter}` };

/** The demo library's Markus Brunner (`demo-library.ts`). */
const MARKUS = 'd0000000-0000-4000-8000-000000000001';

const avatarDeps = { photos: {}, media: {}, ids, clock } as unknown as AvatarDeps;

let sqlite: Database;
let db: BunSQLiteDatabase<typeof schema>;
let wiring: ImmichWiring;
let admin: AuthUser;

beforeEach(async () => {
	counter = 0;
	sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
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
	const contacts = createDrizzleContactRepository(db);
	wiring = {
		config: {
			immich: { mode: 'demo', publicUrl: DEMO_PUBLIC_URL },
			sessionSecret: 'a-session-secret-of-some-length'
		},
		db,
		clock,
		ids,
		contacts,
		contactDeps: { contacts, ids, clock },
		contextReads: createDrizzlePersonContextReads(db),
		avatarDeps
	};
});

const adderOf = (user: AuthUser) => ({
	userId: user.id,
	householdId: user.householdId,
	locale: 'en' as const
});

describe('createImmichServices', () => {
	it('is null without a configured Immich, so the feature appears nowhere', () => {
		expect(createImmichServices({ ...wiring, config: { ...wiring.config, immich: null } })).toBe(
			null
		);
	});

	it('hands every Immich deps the one gateway, signer and link repository', () => {
		const immich = createImmichServices(wiring);
		if (!immich) throw new Error('Immich should be configured');
		const { gateway, signer, publicUrl } = immich;
		expect(publicUrl).toBe(DEMO_PUBLIC_URL);
		const { links } = immich.immichLinkDeps;
		for (const deps of [
			immich.immichGlimpseDeps,
			immich.immichMediaDeps,
			immich.immichMatchingDeps,
			immich.addFromImmichDeps,
			immich.useImmichPhotoDeps
		]) {
			expect<unknown>(deps.links).toBe(links);
		}
		expect<unknown>(immich.immichMediaDeps.gateway).toBe(gateway);
		expect(immich.immichMediaDeps.signer).toBe(signer);
		expect(immich.immichMatchingDeps.ignores).toBe(immich.immichIgnoreDeps.ignores);
		expect(immich.immichMatchingDeps.nameIgnores).toBe(immich.immichNameIgnoreDeps.nameIgnores);
		expect(immich.immichMatchingDeps.contextReads).toBe(wiring.contextReads);
		expect<unknown>(immich.immichLinkDeps.contacts).toBe(wiring.contacts);
	});

	it('adds a person from a face and links them, through the one link repository', async () => {
		const immich = createImmichServices(wiring);
		if (!immich) throw new Error('Immich should be configured');

		const contactId = await addPersonFromImmich(immich.addFromImmichDeps, adderOf(admin), MARKUS, {
			firstName: 'Markus',
			lastName: 'Brunner',
			nickname: '',
			description: ''
		});

		const viewer = { id: admin.id, householdId: admin.householdId };
		const link = await readImmichLink(immich.immichLinkDeps, viewer, contactId);
		expect(link?.immichPersonId).toBe(MARKUS);
		expect((await immich.connection.status()).state).toBe('connected');
	});
});

describe('createServices', () => {
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

	it('groups the immich context under `immich`, over the people and media contexts', async () => {
		const services = createServices({
			// Nothing here touches a file: the media store is lazy on disk.
			config: {
				...config,
				mediaDir: '/nonexistent/stella-media',
				immich: wiring.config.immich,
				sessionSecret: wiring.config.sessionSecret
			},
			db,
			sqlite,
			clock,
			ids
		});
		const { immich } = services;
		if (!immich) throw new Error('Immich should be configured');
		expect<unknown>(immich.immichLinkDeps.contacts).toBe(services.people.contacts);
		expect(immich.immichMatchingDeps.contextReads).toBe(
			services.people.personContextDeps.contextReads
		);

		// A person added from a face is added the way every person is, through `people`.
		const contactId = await addPersonFromImmich(immich.addFromImmichDeps, adderOf(admin), MARKUS, {
			firstName: 'Markus',
			lastName: 'Brunner',
			nickname: '',
			description: ''
		});
		const viewer = { id: admin.id, householdId: admin.householdId };
		expect((await services.people.contacts.findByIdVisibleTo(viewer, contactId))?.displayName).toBe(
			'Markus Brunner'
		);
	});

	it('leaves `immich` null without a configured Immich', () => {
		const services = createServices({
			config: {
				...config,
				mediaDir: '/nonexistent/stella-media',
				immich: null,
				sessionSecret: wiring.config.sessionSecret
			},
			db,
			sqlite,
			clock,
			ids
		});
		expect(services.immich).toBe(null);
	});
});
