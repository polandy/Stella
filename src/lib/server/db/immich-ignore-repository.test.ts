import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import * as schema from './schema';
import { createDrizzleImmichIgnoreRepository } from './immich-ignore-repository';

/*
 * Integration spec for the Drizzle ImmichIgnoreRepository: an ignored pair follows its
 * contact's visibility (docs/concepts/immich.md §5), keeps its first record, and goes with the
 * contact.
 */

const H = 'household-1';
const OTHER_H = 'household-2';
const asAnna: Viewer = { id: 'u-anna', householdId: H };
const asBert: Viewer = { id: 'u-bert', householdId: H };
const asDora: Viewer = { id: 'u-dora', householdId: OTHER_H };
const PERSON = '0b1e2a3c-4d5e-4f60-8a1b-2c3d4e5f6a70';
const OTHER_PERSON = '0c2e3a4b-5d6e-4f70-9a2b-3c4d5e6f7a81';

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleImmichIgnoreRepository>;

const ignored = (
	contactId: string,
	immichPersonId = PERSON,
	ignoredBy = 'u-anna',
	ignoredAt = 5
) => ({
	contactId,
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
	db.insert(schema.contact)
		.values([
			{
				id: 'c-shared',
				householdId: H,
				createdBy: 'u-anna',
				visibility: 'shared',
				displayName: 'Carl'
			},
			{
				id: 'c-private',
				householdId: H,
				createdBy: 'u-anna',
				visibility: 'private',
				displayName: 'Private'
			}
		])
		.run();
	repo = createDrizzleImmichIgnoreRepository(db);
});

describe('createDrizzleImmichIgnoreRepository', () => {
	it('keeps pairs and lists them to those who see the contact', async () => {
		await repo.save([ignored('c-shared'), ignored('c-shared', OTHER_PERSON), ignored('c-private')]);

		expect(await repo.listVisibleTo(asAnna)).toHaveLength(3);
		expect(await repo.listVisibleTo(asBert)).toEqual([
			ignored('c-shared'),
			ignored('c-shared', OTHER_PERSON)
		]);
		expect(await repo.listVisibleTo(asDora)).toEqual([]);
	});

	it('keeps the first record of a pair ignored twice', async () => {
		await repo.save([ignored('c-shared', PERSON, 'u-anna', 5)]);
		await repo.save([ignored('c-shared', PERSON, 'u-bert', 9)]);

		expect(await repo.listVisibleTo(asAnna)).toEqual([ignored('c-shared', PERSON, 'u-anna', 5)]);
	});

	it('removes a pair only for a viewer who sees the contact', async () => {
		await repo.save([ignored('c-private'), ignored('c-shared')]);

		expect(await repo.remove(asBert, 'c-private', PERSON)).toBe(false);
		expect(await repo.remove(asDora, 'c-shared', PERSON)).toBe(false);
		expect(await repo.listVisibleTo(asAnna)).toHaveLength(2);

		expect(await repo.remove(asBert, 'c-shared', PERSON)).toBe(true);
		expect(await repo.listVisibleTo(asAnna)).toEqual([ignored('c-private')]);
	});

	it('goes with its contact', async () => {
		await repo.save([ignored('c-shared')]);
		db.delete(schema.contact).run();
		expect(db.select().from(schema.immichIgnore).all()).toEqual([]);
	});
});
