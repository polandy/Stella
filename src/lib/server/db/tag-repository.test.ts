import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import type { NewTag } from '../domain/tags/tags';
import * as schema from './schema';
import { createDrizzleTagRepository } from './tag-repository';

/*
 * Integration spec for the Drizzle TagRepository: case-insensitive lookup, idempotent
 * assignment, and visibility-scoped reads (tags on a private contact stay private).
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewerU1: Viewer = { id: U1, householdId: H };
const viewerU2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleTagRepository>;

const tag = (over: Partial<NewTag>): NewTag => ({
	id: 't',
	householdId: H,
	name: 'Family',
	color: 'green',
	createdAt: 0,
	updatedAt: 0,
	...over
});

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user).values([
		{ id: U1, householdId: H, email: 'u1@x.test', name: 'One' },
		{ id: U2, householdId: H, email: 'u2@x.test', name: 'Two' }
	]).run();
	db.insert(schema.contact).values([
		{ id: 'c-shared', householdId: H, createdBy: U1, visibility: 'shared', displayName: 'Shared' },
		{ id: 'c-priv', householdId: H, createdBy: U1, visibility: 'private', displayName: 'Private' }
	]).run();
	repo = createDrizzleTagRepository(db);
});

describe('tags', () => {
	it('finds a tag by name case-insensitively', async () => {
		await repo.insert(tag({ id: 't-fam', name: 'Family' }));
		expect((await repo.findByName(H, 'family'))?.id).toBe('t-fam');
		expect(await repo.findByName(H, 'nope')).toBeNull();
	});

	it('assigns idempotently and unassigns', async () => {
		await repo.insert(tag({ id: 't-fam' }));
		await repo.assign('c-shared', 't-fam');
		await repo.assign('c-shared', 't-fam'); // duplicate — must not error or duplicate
		expect(await repo.listForContactVisibleTo(viewerU1, 'c-shared')).toHaveLength(1);
		await repo.unassign('c-shared', 't-fam');
		expect(await repo.listForContactVisibleTo(viewerU1, 'c-shared')).toHaveLength(0);
	});
});

describe('visibility scoping', () => {
	beforeEach(async () => {
		await repo.insert(tag({ id: 't-fam', name: 'Family' }));
		await repo.assign('c-shared', 't-fam');
		await repo.assign('c-priv', 't-fam');
	});

	it('hides tags on a private contact from non-owners', async () => {
		expect(await repo.listForContactVisibleTo(viewerU2, 'c-priv')).toHaveLength(0);
		expect(await repo.listForContactVisibleTo(viewerU1, 'c-priv')).toHaveLength(1);
	});

	it('lists only visible contacts for a tag', async () => {
		expect((await repo.listContactsByTagVisibleTo(viewerU2, 't-fam')).map((c) => c.id)).toEqual([
			'c-shared'
		]);
		expect((await repo.listContactsByTagVisibleTo(viewerU1, 't-fam')).map((c) => c.id).sort()).toEqual([
			'c-priv',
			'c-shared'
		]);
	});
});
