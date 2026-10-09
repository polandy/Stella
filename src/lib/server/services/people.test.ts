import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { registerFirstAdmin, type AuthUser } from '../auth/accounts';
import type { Clock } from '../clock';
import { createDrizzleAccountRepository } from '../db/account-repository';
import { createDrizzleKinshipGraphReads } from '../db/kinship-graph-read';
import * as schema from '../db/schema';
import { createContact } from '../domain/contacts/contacts';
import { deleteContact } from '../domain/contacts/remove-contact';
import { setSelfContact } from '../domain/household/self-contact';
import type { IdGenerator } from '../id';
import { hashPassword, verifyPassword } from '../auth/password';
import type { AuthConfig } from './auth';
import { createServices } from './app-services';
import { createPeopleServices, type PeopleWiring } from './people';

/*
 * The people group of the composition root (docs/08 §8.3), built over a real in-memory
 * SQLite: what the edge gets from `locals.services.people` must work end to end, and the
 * contact repository must exist once, so what one use-case writes the next one reads.
 */

const clock: Clock = { now: () => Date.UTC(2026, 9, 7, 9) };
let counter = 0;
const ids: IdGenerator = { next: () => `id-${++counter}` };
const deleted: string[] = [];
const media: PeopleWiring['media'] = {
	delete: async (key) => {
		deleted.push(key);
	}
};

let sqlite: Database;
let db: BunSQLiteDatabase<typeof schema>;
let wiring: PeopleWiring;
let admin: AuthUser;

beforeEach(async () => {
	counter = 0;
	deleted.length = 0;
	sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	const accounts = createDrizzleAccountRepository(db);
	admin = await registerFirstAdmin(
		{ accounts, ids, hashPassword, verifyPassword },
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
		clock,
		ids,
		accounts,
		kinship: createDrizzleKinshipGraphReads(db),
		media
	};
});

const viewerOf = (user: AuthUser) => ({ id: user.id, householdId: user.householdId });

async function addAnna(contactDeps: Parameters<typeof createContact>[0]) {
	return createContact(
		contactDeps,
		{
			userId: admin.id,
			householdId: admin.householdId,
			defaultVisibility: 'shared',
			locale: 'en'
		},
		{ firstName: 'Anna', lastName: 'Pollari' }
	);
}

describe('createPeopleServices', () => {
	it('hands every use-case that writes a contact the one contact repository', async () => {
		const people = createPeopleServices(wiring);
		expect(people.contactDeps.contacts).toBe(people.contacts);
		expect(people.nameDeps.names).toBe(people.contacts);
		expect(people.lastNameDeps.names).toBe(people.contacts);
		expect(people.surnameDismissalDeps.names).toBe(people.contacts);
		expect(people.withoutLastNameDeps.withoutLastName).toBe(people.contacts);
		expect(people.withoutLastNameDeps.clock).toBe(clock);
		expect(people.selfContactDeps.contacts).toBe(people.contacts);
		expect(people.deleteContactDeps.contacts).toBe(people.contacts);
		// The lists are read models apart, each handed on as the one instance.
		expect(people.contactDirectoryDeps.directory).toBe(people.directory);
		expect(people.contactNameDeps.contactNames).toBe(people.contactNames);

		const id = await addAnna(people.contactDeps);
		expect((await people.contacts.findByIdVisibleTo(viewerOf(admin), id))?.displayName).toBe(
			'Anna Pollari'
		);
	});

	it('hands the injected clock and ids to the use-cases that write', () => {
		const people = createPeopleServices(wiring);
		for (const deps of [
			people.contactDeps,
			people.nameDeps,
			people.surnameDismissalDeps,
			people.deleteContactDeps
		]) {
			expect(deps.clock).toBe(clock);
			expect(deps.ids).toBe(ids);
		}
		expect(people.namesakeContextDeps.clock).toBe(clock);
	});

	it('shares one surname-dismissal repository between the review and the *not this name*', () => {
		const people = createPeopleServices(wiring);
		expect(people.surnameReviewDeps.surnameDismissals).toBe(
			people.surnameDismissalDeps.surnameDismissals
		);
		expect(people.surnameReviewDeps.kinship).toBe(wiring.kinship);
	});

	it('reads a namesake’s context through the same reads as the person context', () => {
		const people = createPeopleServices(wiring);
		expect(people.namesakeContextDeps.contextReads).toBe(people.personContextDeps.contextReads);
	});

	it('reads who a member is off the injected accounts', async () => {
		const people = createPeopleServices(wiring);
		expect(people.selfContactDeps.accounts).toBe(wiring.accounts);
		expect(await people.namesakeContextDeps.selfContactOf(admin.id)).toBeNull();

		const id = await addAnna(people.contactDeps);
		await setSelfContact(people.selfContactDeps, viewerOf(admin), id);
		expect(await people.namesakeContextDeps.selfContactOf(admin.id)).toBe(id);
	});

	it('unlinks a deleted person’s files through the injected media store', async () => {
		const people = createPeopleServices(wiring);
		const id = await addAnna(people.contactDeps);
		expect(await deleteContact(people.deleteContactDeps, viewerOf(admin), id)).toBe(true);
		expect(people.deleteContactDeps.photoFiles).toBe(media);
		expect(await people.contacts.findByIdVisibleTo(viewerOf(admin), id)).toBeNull();
	});
});

describe('createServices', () => {
	it('groups the people context under `people`, over the auth context’s accounts', () => {
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
			// Nothing here touches a file: the media store is lazy on disk.
			config: {
				...config,
				immich: null,
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
		expect(services.people.selfContactDeps.accounts).toBe(services.auth.accounts);
	});
});
