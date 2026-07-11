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
	role: 'admin'
};

async function seedAdmin(passwordHash: string | null = 'hashed:pw') {
	await repo.insertHouseholdWithAdmin({
		household: { id: admin.householdId, name: 'Pollari' },
		user: { ...admin, roleLocked: 1, passwordHash: passwordHash ?? '' }
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
		await seedAdmin('hashed:secret');
		expect(await repo.findCredentialsByEmail('andy@example.test')).toEqual({
			user: admin,
			passwordHash: 'hashed:secret'
		});
	});

	it('returns null for an unknown email', async () => {
		expect(await repo.findCredentialsByEmail('nobody@example.test')).toBeNull();
	});
});
