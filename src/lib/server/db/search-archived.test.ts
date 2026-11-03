import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import { toFtsQuery } from '../domain/search/query';
import * as schema from './schema';
import { ensureSearchIndex } from './search-index';
import { createDrizzleSearchRepository } from './search-repository';

/*
 * Archiving takes a person out of the search (docs/02 §2.2) — and with them every record about
 * them: a note, moment, gift or to-do of an archived person must not bring them back into the
 * results. Each case keeps a positive control: the same word on a person still in the book is
 * found.
 */

const H = 'household-1';
const U1 = 'user-1';
const viewer: Viewer = { id: U1, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleSearchRepository>;

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	ensureSearchIndex(sqlite);

	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user).values({ id: U1, householdId: H, email: 'u1@x.test', name: 'One' }).run();
	db.insert(schema.contact)
		.values([
			{ id: 'c-kept', householdId: H, createdBy: U1, visibility: 'shared', displayName: 'Eva' },
			{
				id: 'c-gone',
				householdId: H,
				createdBy: U1,
				visibility: 'shared',
				displayName: 'Otto',
				archivedAt: 1_700_000_000_000
			}
		])
		.run();
	for (const contactId of ['c-kept', 'c-gone']) {
		const base = { contactId, createdBy: U1, visibility: 'shared' as const };
		db.insert(schema.note)
			.values({ ...base, id: `n-${contactId}`, body: 'Zeltlager am See' })
			.run();
		db.insert(schema.journalEntry)
			.values({ ...base, id: `j-${contactId}`, entryDate: '2026-10-01', body: 'Zeltlager am See' })
			.run();
		db.insert(schema.gift)
			.values({ ...base, id: `g-${contactId}`, state: 'idea', title: 'Zeltlager Fotobuch' })
			.run();
		db.insert(schema.todo)
			.values({ ...base, id: `t-${contactId}`, title: 'Zeltlager planen' })
			.run();
	}

	repo = createDrizzleSearchRepository(db);
});

const query = toFtsQuery('zeltlager');

describe('full search leaves out the records of an archived person', () => {
	it('finds notes only of people still in the book', async () => {
		const hits = await repo.searchNotes(viewer, query, 20);
		expect(hits.map((h) => h.noteId)).toEqual(['n-c-kept']);
	});

	it('finds moments only of people still in the book', async () => {
		const hits = await repo.searchMoments(viewer, query, 20);
		expect(hits.map((h) => h.entryId)).toEqual(['j-c-kept']);
	});

	it('finds gifts only of people still in the book', async () => {
		const hits = await repo.searchGifts(viewer, query, 20);
		expect(hits.map((h) => h.giftId)).toEqual(['g-c-kept']);
	});

	it('finds to-dos only of people still in the book', async () => {
		const hits = await repo.searchTodos(viewer, query, 20);
		expect(hits.map((h) => h.todoId)).toEqual(['t-c-kept']);
	});

	it('finds them all again once the person is brought back', async () => {
		db.update(schema.contact).set({ archivedAt: null }).where(eq(schema.contact.id, 'c-gone')).run();
		expect(await repo.searchNotes(viewer, query, 20)).toHaveLength(2);
		expect(await repo.searchMoments(viewer, query, 20)).toHaveLength(2);
		expect(await repo.searchGifts(viewer, query, 20)).toHaveLength(2);
		expect(await repo.searchTodos(viewer, query, 20)).toHaveLength(2);
	});
});
