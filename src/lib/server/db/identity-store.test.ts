import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { sequentialIds } from '../domain/testing';
import { createDrizzleIdentityStore } from './identity-store';
import * as schema from './schema';

/*
 * The lookups an SSO sign-in starts from (docs/02 §2.1.2): the user behind an identity, or
 * behind an email — each saying whether an admin removed them, so the planner can turn the
 * member away instead of provisioning a fresh account (§2.1).
 */

let db: BunSQLiteDatabase<typeof schema>;
let store: ReturnType<typeof createDrizzleIdentityStore>;

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	store = createDrizzleIdentityStore(db, sequentialIds(), 'authelia');
	db.insert(schema.household).values({ id: 'h', name: 'H' }).run();
	db.insert(schema.user)
		.values([
			{ id: 'u-andy', householdId: 'h', email: 'andy@x.test', name: 'Andy' },
			{ id: 'u-nina', householdId: 'h', email: 'nina@x.test', name: 'Nina', removedAt: 1 }
		])
		.run();
	db.insert(schema.identity)
		.values([
			{ id: 'i-andy', userId: 'u-andy', provider: 'authelia', issuer: 'iss', subject: 'andy' },
			{ id: 'i-nina', userId: 'u-nina', provider: 'authelia', issuer: 'iss', subject: 'nina' }
		])
		.run();
});

describe('createDrizzleIdentityStore', () => {
	it('finds the user behind an identity, and whether they were removed', async () => {
		expect(await store.findUserByIssuerSubject('iss', 'andy')).toEqual({
			id: 'u-andy',
			removed: false
		});
		expect(await store.findUserByIssuerSubject('iss', 'nina')).toEqual({
			id: 'u-nina',
			removed: true
		});
		expect(await store.findUserByIssuerSubject('other-iss', 'andy')).toBeNull();
	});

	it('finds the user behind an email the same way', async () => {
		expect(await store.findUserByEmail('nina@x.test')).toEqual({ id: 'u-nina', removed: true });
		expect(await store.findUserByEmail('nobody@x.test')).toBeNull();
	});
});
