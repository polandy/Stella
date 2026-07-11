import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as schema from './schema';
import { createDrizzleSessionRepository } from './session-repository';

/*
 * Integration spec for the Drizzle adapter implementing the SessionRepository port
 * (docs/08 §8.3). Runs against a real in-memory SQLite so the mapping and the FK to `user`
 * are exercised for real.
 */

const HOUSEHOLD = 'household-1';
const USER = 'user-1';

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleSessionRepository>;

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: HOUSEHOLD, name: 'H' }).run();
	db.insert(schema.user)
		.values({ id: USER, householdId: HOUSEHOLD, email: 'u@example.test', name: 'U' })
		.run();
	repo = createDrizzleSessionRepository(db);
});

describe('createDrizzleSessionRepository', () => {
	it('creates a session and reads it back by id', async () => {
		await repo.create({ id: 'sess-1', userId: USER, expiresAt: 123456 });
		expect(await repo.findById('sess-1')).toEqual({ id: 'sess-1', userId: USER, expiresAt: 123456 });
	});

	it('returns null for an unknown id', async () => {
		expect(await repo.findById('missing')).toBeNull();
	});

	it('updates the expiry in place', async () => {
		await repo.create({ id: 'sess-1', userId: USER, expiresAt: 100 });
		await repo.updateExpiry('sess-1', 999);
		expect((await repo.findById('sess-1'))?.expiresAt).toBe(999);
	});

	it('deletes a session', async () => {
		await repo.create({ id: 'sess-1', userId: USER, expiresAt: 100 });
		await repo.delete('sess-1');
		expect(await repo.findById('sess-1')).toBeNull();
	});
});
