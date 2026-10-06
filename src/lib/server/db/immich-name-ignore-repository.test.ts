import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import * as schema from './schema';
import { createDrizzleImmichNameIgnoreRepository } from './immich-name-ignore-repository';

/*
 * Integration spec for the Drizzle ImmichNameIgnoreRepository: an Immich name the household said
 * is nobody to add is the household's record — every member reads it and may take it back, no
 * other household ever does — and the first record of it stands.
 */

const H = 'household-1';
const OTHER_H = 'household-2';
const asAnna: Viewer = { id: 'u-anna', householdId: H };
const asBert: Viewer = { id: 'u-bert', householdId: H };
const asDora: Viewer = { id: 'u-dora', householdId: OTHER_H };
const PERSON = '0b1e2a3c-4d5e-4f60-8a1b-2c3d4e5f6a70';
const OTHER_PERSON = '0c2e3a4b-5d6e-4f70-9a2b-3c4d5e6f7a81';

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleImmichNameIgnoreRepository>;

const ignored = (
	householdId: string,
	immichPersonId = PERSON,
	ignoredBy = 'u-anna',
	ignoredAt = 5
) => ({
	householdId,
	immichPersonId,
	ignoredBy,
	ignoredAt
});

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household)
		.values([
			{ id: H, name: 'H' },
			{ id: OTHER_H, name: 'Other' }
		])
		.run();
	db.insert(schema.user)
		.values([
			{ id: 'u-anna', householdId: H, email: 'anna@example.test', name: 'Anna' },
			{ id: 'u-bert', householdId: H, email: 'bert@example.test', name: 'Bert' },
			{ id: 'u-dora', householdId: OTHER_H, email: 'dora@example.test', name: 'Dora' }
		])
		.run();
	repo = createDrizzleImmichNameIgnoreRepository(db);
});

describe('ImmichNameIgnoreRepository', () => {
	it('lists the household’s ignored names to every member, oldest first', async () => {
		await repo.save(ignored(H, OTHER_PERSON, 'u-bert', 9));
		await repo.save(ignored(H, PERSON, 'u-anna', 5));
		expect(await repo.listForHousehold(asAnna)).toEqual([
			ignored(H, PERSON, 'u-anna', 5),
			ignored(H, OTHER_PERSON, 'u-bert', 9)
		]);
		expect(await repo.listForHousehold(asBert)).toHaveLength(2);
	});

	it('never shows one household’s ignored names to another', async () => {
		await repo.save(ignored(H));
		expect(await repo.listForHousehold(asDora)).toEqual([]);
	});

	it('keeps the first record when a name is ignored twice', async () => {
		await repo.save(ignored(H, PERSON, 'u-anna', 5));
		await repo.save(ignored(H, PERSON, 'u-bert', 9));
		expect(await repo.listForHousehold(asAnna)).toEqual([ignored(H, PERSON, 'u-anna', 5)]);
	});

	it('lets any member take an ignored name back, and says when there was none', async () => {
		await repo.save(ignored(H));
		expect(await repo.remove(asBert, PERSON)).toBe(true);
		expect(await repo.listForHousehold(asAnna)).toEqual([]);
		expect(await repo.remove(asBert, PERSON)).toBe(false);
	});

	it('does not let another household take it back', async () => {
		await repo.save(ignored(H));
		expect(await repo.remove(asDora, PERSON)).toBe(false);
		expect(await repo.listForHousehold(asAnna)).toHaveLength(1);
	});
});
