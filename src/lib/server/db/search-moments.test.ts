import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import { toFtsQuery } from '../domain/search/query';
import { writeEntryTags } from './entry-tags';
import * as schema from './schema';
import { ensureSearchIndex } from './search-index';
import { createDrizzleSearchRepository } from './search-repository';

/*
 * Moments in full search (docs/02 §2.9, §2.20.2): the journal index the triggers keep, a tag
 * found as a plain word and as `#tag`, and the same visibility scoping as notes — another
 * member's private moment never appears.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewerU1: Viewer = { id: U1, householdId: H };
const viewerU2: Viewer = { id: U2, householdId: H };

let sqlite: Database;
let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleSearchRepository>;
let seq = 0;
const ids = { next: () => `id-${++seq}` };

function entry(
	id: string,
	body: string,
	extra: Partial<typeof schema.journalEntry.$inferInsert> = {}
) {
	db.insert(schema.journalEntry)
		.values({
			id,
			contactId: 'c-hans',
			createdBy: U1,
			visibility: 'shared',
			entryDate: `2026-10-${String(10 + seq++).padStart(2, '0')}`,
			body,
			...extra
		})
		.run();
}

const words = (q: string) => toFtsQuery(q);

beforeEach(() => {
	sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	ensureSearchIndex(sqlite);

	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user)
		.values([
			{ id: U1, householdId: H, email: 'u1@x.test', name: 'One' },
			{ id: U2, householdId: H, email: 'u2@x.test', name: 'Two' }
		])
		.run();
	db.insert(schema.contact)
		.values([
			{ id: 'c-hans', householdId: H, createdBy: U1, visibility: 'shared', displayName: 'Hans' },
			{ id: 'c-eva', householdId: H, createdBy: U1, visibility: 'shared', displayName: 'Eva Roth' }
		])
		.run();
	repo = createDrizzleSearchRepository(db);
});

describe('searchMoments by words', () => {
	it('finds a moment by its title and body, with the person it is on', async () => {
		entry('j-1', 'Walked around the lake', { title: 'Sunday' });

		const byBody = await repo.searchMoments(viewerU1, words('lake'), 20);
		expect(byBody).toEqual([
			expect.objectContaining({ entryId: 'j-1', contactId: 'c-hans', contactName: 'Hans' })
		]);
		expect(byBody[0].snippet).toContain('lake');
		expect(await repo.searchMoments(viewerU1, words('sunday'), 20)).toHaveLength(1);
	});

	it('finds a tag as the plain word', async () => {
		entry('j-1', 'Up the hill #Hike');

		expect(await repo.searchMoments(viewerU1, words('hike'), 20)).toHaveLength(1);
	});

	it('follows an edit and a removal', async () => {
		entry('j-1', 'about the lake');
		db.update(schema.journalEntry)
			.set({ body: 'about the sea' })
			.where(eq(schema.journalEntry.id, 'j-1'))
			.run();
		expect(await repo.searchMoments(viewerU1, words('lake'), 20)).toEqual([]);
		expect(await repo.searchMoments(viewerU1, words('sea'), 20)).toHaveLength(1);

		db.delete(schema.journalEntry).where(eq(schema.journalEntry.id, 'j-1')).run();
		expect(await repo.searchMoments(viewerU1, words('sea'), 20)).toEqual([]);
	});

	it('reads a mention as the person’s current name, and follows a rename', async () => {
		entry('j-1', 'coffee with @{contact:c-eva}');
		db.insert(schema.journalMention).values({ journalEntryId: 'j-1', contactId: 'c-eva' }).run();

		expect(await repo.searchMoments(viewerU1, words('roth'), 20)).toHaveLength(1);
		// The token's own words are not indexed.
		expect(await repo.searchMoments(viewerU1, words('contact'), 20)).toEqual([]);

		db.update(schema.contact)
			.set({ displayName: 'Eva Keller' })
			.where(eq(schema.contact.id, 'c-eva'))
			.run();
		expect(await repo.searchMoments(viewerU1, words('keller'), 20)).toHaveLength(1);
		expect(await repo.searchMoments(viewerU1, words('roth'), 20)).toEqual([]);
	});

	it('shows a private moment to its author only, marked private', async () => {
		entry('j-1', 'secret lake plan', { visibility: 'private' });

		const own = await repo.searchMoments(viewerU1, words('lake'), 20);
		expect(own).toEqual([expect.objectContaining({ entryId: 'j-1', visibility: 'private' })]);
		expect(await repo.searchMoments(viewerU2, words('lake'), 20)).toEqual([]);
	});
});

describe('searchMomentsByTag', () => {
	it('finds the moments carrying the tag, whatever its case', async () => {
		entry('j-1', 'Up the hill #Hike');
		entry('j-2', 'a hike without the tag');
		writeEntryTags(db, ids, 'j-1', ['Hike']);

		const hits = await repo.searchMomentsByTag(viewerU1, 'hike', 20);
		expect(hits.map((h) => h.entryId)).toEqual(['j-1']);
		expect(hits[0].snippet).toContain('#Hike');
	});

	it('keeps another member’s private moment out', async () => {
		entry('j-1', 'quiet #Hike', { visibility: 'private' });
		writeEntryTags(db, ids, 'j-1', ['Hike']);

		expect(await repo.searchMomentsByTag(viewerU1, 'hike', 20)).toHaveLength(1);
		expect(await repo.searchMomentsByTag(viewerU2, 'hike', 20)).toEqual([]);
	});
});

describe('the journal index on an existing database', () => {
	it('builds the rows for moments written before it existed', () => {
		entry('j-old', 'an old lake walk');
		// What a database from before the journal index looks like: the moment, no row for it.
		sqlite.exec('DELETE FROM journal_fts; DELETE FROM search_index_meta;');

		ensureSearchIndex(sqlite);

		const row = sqlite.query('SELECT content FROM journal_fts WHERE entry_id = ?').get('j-old') as {
			content: string;
		};
		expect(row.content).toContain('lake');
	});
});
