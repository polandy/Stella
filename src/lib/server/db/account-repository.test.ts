import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { AuthUser } from '../auth/accounts';
import * as schema from './schema';
import { createDrizzleAccountRepository } from './account-repository';

/*
 * Integration spec for the Drizzle adapter implementing the AccountRepository port
 * (docs/08 §8.3), against a real in-memory SQLite so the household/user insert and the
 * unique-email constraint are exercised for real.
 */

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleAccountRepository>;

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	repo = createDrizzleAccountRepository(db);
});

const admin: AuthUser = {
	id: 'user-1',
	householdId: 'household-1',
	email: 'andy@example.test',
	name: 'Andy',
	role: 'admin',
	locale: 'en',
	selfContactId: null
};

async function seedAdmin(
	options: { passwordHash?: string | null; locale?: AuthUser['locale'] } = {}
) {
	const { passwordHash = 'hashed:pw', locale = admin.locale } = options;
	await repo.insertHouseholdWithAdmin({
		household: { id: admin.householdId, name: 'Pollari' },
		user: { ...admin, locale, roleLocked: 1, passwordHash: passwordHash ?? '' }
	});
}

describe('createDrizzleAccountRepository', () => {
	it('starts with no users', async () => {
		expect(await repo.countUsers()).toBe(0);
	});

	it('creates a household with its admin atomically', async () => {
		await seedAdmin();
		expect(await repo.countUsers()).toBe(1);
		expect(await repo.findById('user-1')).toEqual(admin);
	});

	it('reads credentials back by email', async () => {
		await seedAdmin({ passwordHash: 'hashed:secret' });
		expect(await repo.findCredentialsByEmail('andy@example.test')).toEqual({
			user: admin,
			passwordHash: 'hashed:secret'
		});
	});

	it('returns null for an unknown email', async () => {
		expect(await repo.findCredentialsByEmail('nobody@example.test')).toBeNull();
	});

	it('stores and reads back the interface language', async () => {
		await seedAdmin();
		await repo.updateLocale('user-1', 'de');
		expect(await repo.findById('user-1')).toEqual({ ...admin, locale: 'de' });
	});

	it('stores which contact the member is, and reads it back on both paths', async () => {
		await seedAdmin();
		db.insert(schema.contact)
			.values({
				id: 'c-me',
				householdId: admin.householdId,
				createdBy: admin.id,
				displayName: 'Andy Pollari'
			})
			.run();

		await repo.updateSelfContact('user-1', 'c-me');

		// Both reads carry it: the session hook goes through findById, signing in through
		// findCredentialsByEmail, and a member is "you" on either route into the app.
		expect(await repo.findById('user-1')).toEqual({ ...admin, selfContactId: 'c-me' });
		expect((await repo.findCredentialsByEmail(admin.email))?.user.selfContactId).toBe('c-me');
	});

	it('lets the member take the link back', async () => {
		await seedAdmin();
		db.insert(schema.contact)
			.values({
				id: 'c-me',
				householdId: admin.householdId,
				createdBy: admin.id,
				displayName: 'Andy Pollari'
			})
			.run();
		await repo.updateSelfContact('user-1', 'c-me');
		// positive control: it really was stored before it was cleared
		expect((await repo.findById('user-1'))?.selfContactId).toBe('c-me');

		await repo.updateSelfContact('user-1', null);

		expect((await repo.findById('user-1'))?.selfContactId).toBeNull();
	});

	it('leaves the language unset until somebody picks one, so the browser still decides', async () => {
		await seedAdmin({ locale: null });
		expect((await repo.findById('user-1'))?.locale).toBeNull();
	});
});
