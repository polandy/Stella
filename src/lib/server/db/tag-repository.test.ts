import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
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
/** The one fixture birthday, asserted where the tag-filtered summary is read back. */
const BIRTH_DATE = '2015-05-20';

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
		{ id: 'c-shared', householdId: H, createdBy: U1, visibility: 'shared', displayName: 'Shared', nickname: 'Sha', birthDate: BIRTH_DATE },
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

	it('carries the nickname on a tag-filtered list, so the directory filter still finds people by it', async () => {
		expect((await repo.listContactsByTagVisibleTo(viewerU1, 't-fam')).find((c) => c.id === 'c-shared')?.nickname).toBe('Sha');
	});

	it('carries the birth date there too, so a tag-filtered list is the same summary', async () => {
		expect((await repo.listContactsByTagVisibleTo(viewerU1, 't-fam')).find((c) => c.id === 'c-shared')?.birthDate).toBe(BIRTH_DATE);
	});

	/*
	 * The safety net for deleting a tag nobody carries: "nobody" has to mean the whole
	 * household, not the people this member happens to see. Counting through the viewer's
	 * eyes would let U2 delete a tag that is still on U1's private contact — taking it off
	 * that contact behind their back.
	 */
	it('counts assignments across the household, including contacts the viewer cannot see', async () => {
		expect(await repo.countAssignments('t-fam')).toBe(2);
		await repo.unassign('c-shared', 't-fam');
		expect(await repo.countAssignments('t-fam')).toBe(1);
		await repo.unassign('c-priv', 't-fam');
		expect(await repo.countAssignments('t-fam')).toBe(0);
	});

	it('deletes a tag and, with it, nothing else', async () => {
		await repo.insert(tag({ id: 't-other', name: 'Other' }));
		await repo.assign('c-shared', 't-other');
		await repo.deleteTag(H, 't-fam');
		expect(await repo.findByName(H, 'Family')).toBeNull();
		expect((await repo.listByHousehold(H)).map((t) => t.id)).toEqual(['t-other']);
		expect(await repo.listForContactVisibleTo(viewerU1, 'c-shared')).toHaveLength(1);
	});

	/*
	 * A deleted contact takes its assignments with it by cascade, never through `unassign` —
	 * so the tags it was the last carrier of have to be swept up separately.
	 */
	it('sweeps up the tags a deleted contact left behind, and only those', async () => {
		await repo.insert(tag({ id: 't-solo', name: 'Solo' }));
		await repo.assign('c-priv', 't-solo');
		db.delete(schema.contact).where(eq(schema.contact.id, 'c-priv')).run();

		expect(await repo.deleteOrphans(H)).toBe(1);
		expect((await repo.listByHousehold(H)).map((t) => t.id)).toEqual(['t-fam']);
	});

	/*
	 * `removeTag` validates the contact but takes `tagId` straight from the form, so a forged
	 * id reaches the delete. Scoping it to the household is what keeps a member of one
	 * household from deleting another household's tag through their own contact's chip row.
	 */
	it('refuses to delete a tag belonging to another household', async () => {
		db.insert(schema.household).values({ id: 'household-3', name: 'Theirs' }).run();
		await repo.insert(tag({ id: 't-theirs', householdId: 'household-3', name: 'Theirs' }));

		await repo.deleteTag(H, 't-theirs');

		expect((await repo.listByHousehold('household-3')).map((t) => t.id)).toEqual(['t-theirs']);
		// …and the same call still deletes the household's own tag, so the scoping is not
		// simply making `deleteTag` a no-op.
		await repo.deleteTag(H, 't-fam');
		expect(await repo.findByName(H, 'Family')).toBeNull();
	});

	it('leaves a tag of another household alone', async () => {
		db.insert(schema.household).values({ id: 'household-2', name: 'Other' }).run();
		await repo.insert(tag({ id: 't-elsewhere', householdId: 'household-2', name: 'Elsewhere' }));

		expect(await repo.deleteOrphans(H)).toBe(0);
		expect((await repo.listByHousehold('household-2')).map((t) => t.id)).toEqual(['t-elsewhere']);
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
