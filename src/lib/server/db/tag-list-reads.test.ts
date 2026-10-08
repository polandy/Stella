import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import * as schema from './schema';
import { createDrizzleTagListReads } from './tag-list-reads';

/*
 * Integration spec for the Drizzle TagListReads: the household's tags, a person's tags and the
 * people with a tag, each read through the access layer — tags on a private contact, and that
 * contact, stay with its owner (docs/03 §3.7).
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewerU1: Viewer = { id: U1, householdId: H };
const viewerU2: Viewer = { id: U2, householdId: H };
/** The one fixture birthday, asserted where the tag-filtered summary is read back. */
const BIRTH_DATE = '2015-05-20';

let lists: ReturnType<typeof createDrizzleTagListReads>;

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	const db: BunSQLiteDatabase<typeof schema> = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household)
		.values([
			{ id: H, name: 'H' },
			{ id: 'household-2', name: 'Other' }
		])
		.run();
	db.insert(schema.user)
		.values([
			{ id: U1, householdId: H, email: 'u1@x.test', name: 'One' },
			{ id: U2, householdId: H, email: 'u2@x.test', name: 'Two' }
		])
		.run();
	db.insert(schema.contact)
		.values([
			{
				id: 'c-shared',
				householdId: H,
				createdBy: U1,
				visibility: 'shared',
				displayName: 'Shared',
				nickname: 'Sha',
				birthDate: BIRTH_DATE
			},
			{ id: 'c-priv', householdId: H, createdBy: U1, visibility: 'private', displayName: 'Private' }
		])
		.run();
	db.insert(schema.tag)
		.values([
			{ id: 't-fam', householdId: H, name: 'Family', color: 'green' },
			{ id: 't-club', householdId: H, name: 'Club', color: 'mauve' },
			{ id: 't-away', householdId: 'household-2', name: 'Away', color: 'blue' }
		])
		.run();
	db.insert(schema.contactTag)
		.values([
			{ contactId: 'c-shared', tagId: 't-fam' },
			{ contactId: 'c-priv', tagId: 't-fam' }
		])
		.run();
	lists = createDrizzleTagListReads(db);
});

describe('listByHousehold', () => {
	it('lists the household’s tags by name, carried or not, and no other household’s', async () => {
		expect(await lists.listByHousehold(H)).toEqual([
			{ id: 't-club', householdId: H, name: 'Club', color: 'mauve' },
			{ id: 't-fam', householdId: H, name: 'Family', color: 'green' }
		]);
	});
});

describe('listForContactVisibleTo', () => {
	it('hides tags on a private contact from non-owners', async () => {
		expect(await lists.listForContactVisibleTo(viewerU2, 'c-priv')).toHaveLength(0);
		expect(await lists.listForContactVisibleTo(viewerU1, 'c-priv')).toHaveLength(1);
	});
});

describe('listContactsByTagVisibleTo', () => {
	it('carries the nickname on a tag-filtered list, so the directory filter still finds people by it', async () => {
		expect(
			(await lists.listContactsByTagVisibleTo(viewerU1, 't-fam')).find((c) => c.id === 'c-shared')
				?.nickname
		).toBe('Sha');
	});

	it('carries the birth date there too, so a tag-filtered list is the same summary', async () => {
		expect(
			(await lists.listContactsByTagVisibleTo(viewerU1, 't-fam')).find((c) => c.id === 'c-shared')
				?.birthDate
		).toBe(BIRTH_DATE);
	});

	it('lists only visible contacts for a tag', async () => {
		expect((await lists.listContactsByTagVisibleTo(viewerU2, 't-fam')).map((c) => c.id)).toEqual([
			'c-shared'
		]);
		expect(
			(await lists.listContactsByTagVisibleTo(viewerU1, 't-fam')).map((c) => c.id).sort()
		).toEqual(['c-priv', 'c-shared']);
	});
});
