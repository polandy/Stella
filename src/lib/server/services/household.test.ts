import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { registerFirstAdmin, type AuthUser } from '../auth/accounts';
import { hashPassword, verifyPassword } from '../auth/password';
import type { Clock } from '../clock';
import { createDrizzleAccountRepository } from '../db/account-repository';
import { createDrizzleContactRepository } from '../db/contact-repository';
import * as schema from '../db/schema';
import { ensureSearchIndex } from '../db/search-index';
import { createContact } from '../domain/contacts/contacts';
import { authorNames, membersViewerFirst } from '../domain/household/members';
import { search } from '../domain/search/search';
import type { IdGenerator } from '../id';
import { createServices } from './app-services';
import type { AuthConfig } from './auth';
import { createHouseholdServices, type HouseholdWiring } from './household';

/*
 * The household group of the composition root (docs/08 §8.3), built over a real in-memory
 * SQLite: what the edge gets from `locals.services.household` must work end to end — the
 * members, the search and the attention list all read the same household.
 */

const clock: Clock = { now: () => Date.UTC(2026, 9, 8, 9) };
let counter = 0;
const ids: IdGenerator = { next: () => `id-${++counter}` };

let sqlite: Database;
let db: BunSQLiteDatabase<typeof schema>;
let wiring: HouseholdWiring;
let admin: AuthUser;

beforeEach(async () => {
	counter = 0;
	sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	ensureSearchIndex(sqlite); // the FTS tables and triggers live outside the migrations
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
	wiring = { db };
});

const viewerOf = (user: AuthUser) => ({ id: user.id, householdId: user.householdId });

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

describe('createHouseholdServices', () => {
	it('hands each household use-case the one repository the edge reads', () => {
		const household = createHouseholdServices(wiring);
		expect(household.memberDeps.members).toBe(household.members);
		expect(household.searchDeps.search).toBe(household.search);
	});

	it('names the household members', async () => {
		const household = createHouseholdServices(wiring);

		const members = await membersViewerFirst(household.memberDeps, viewerOf(admin));
		expect(members.map((member) => member.name)).toEqual(['Andy']);
		const nameOf = await authorNames(household.memberDeps, admin.householdId);
		expect(nameOf(admin.id)).toBe('Andy');
	});

	it('finds a person through the search and lists them for attention', async () => {
		const household = createHouseholdServices(wiring);
		const anna = await addPerson('Anna');

		const results = await search(household.searchDeps, viewerOf(admin), 'Anna');
		expect(results.contacts.map((hit) => hit.id)).toEqual([anna]);
		const touched = await household.attention.listLastTouchedVisibleTo(viewerOf(admin));
		expect(touched).toEqual([{ contactId: anna, lastTouchedOn: null }]);
	});
});

describe('createServices', () => {
	it('groups the household context under `household`', () => {
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
				mediaDir: '/nonexistent/stella-media'
			},
			db,
			sqlite,
			clock,
			ids
		});
		expect(services.household.memberDeps.members).toBe(services.household.members);
		expect(services.household.searchDeps.search).toBe(services.household.search);
	});
});
