import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as schema from './schema';
import { ensureSearchIndex } from './search-index';

/*
 * The one-off backfill in `ensureSearchIndex` (docs/03 §3.5). Every other search test creates
 * the index *before* it writes anything, so the triggers do the work and this branch never
 * runs — yet it is the branch that decides what an existing database looks like after an
 * upgrade, and it has to build the same content the triggers do, mentions included.
 */

const H = 'household-1';
const U = 'user-1';

let sqlite: Database;
let db: BunSQLiteDatabase<typeof schema>;

/** Rows the index holds for a note, so a test can read the content the SQL assembled. */
function indexed(noteId: string): string {
	const row = sqlite
		.query('SELECT content FROM note_fts WHERE note_id = ?')
		.get(noteId) as { content: string } | null;
	return row?.content ?? '';
}

beforeEach(() => {
	sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });

	// Deliberately written before the index exists: this is the shape of a database that
	// predates the FTS tables, which is what the backfill is for.
	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user).values({ id: U, householdId: H, email: 'u@x.test', name: 'One' }).run();
	db.insert(schema.contact)
		.values([
			{ id: 'c-beat', householdId: H, createdBy: U, visibility: 'shared', displayName: 'Beat Steiner' },
			{ id: 'c-sandra', householdId: H, createdBy: U, visibility: 'shared', displayName: 'Sandra Keller' }
		])
		.run();
	db.insert(schema.note)
		.values({
			id: 'n-1',
			contactId: 'c-beat',
			createdBy: U,
			visibility: 'shared',
			title: 'Hike',
			body: 'walked home with @{contact:c-sandra}'
		})
		.run();
	db.insert(schema.noteMention).values({ noteId: 'n-1', contactId: 'c-sandra' }).run();
});

describe('ensureSearchIndex backfill', () => {
	it('indexes a note that existed before the index did, mentioned name and all', () => {
		ensureSearchIndex(sqlite);

		const content = indexed('n-1');
		expect(content).toContain('Hike');
		expect(content).toContain('walked home');
		// The mentioned person's name is in the index although it is nowhere in the body.
		expect(content).toContain('Sandra Keller');
		// …and the token's syntax is not, so nobody searching "contact" finds this note.
		expect(content).not.toContain('@{contact:');
	});

	it('leaves an index that already has rows alone, so a restart is not a rebuild', () => {
		ensureSearchIndex(sqlite);
		sqlite.exec("UPDATE note_fts SET content = 'edited by hand' WHERE note_id = 'n-1'");

		ensureSearchIndex(sqlite);

		expect(indexed('n-1')).toBe('edited by hand');
		// Positive control: one row, so the second run added nothing beside it either.
		const rows = sqlite.query('SELECT count(*) AS c FROM note_fts').get() as { c: number };
		expect(rows.c).toBe(1);
	});

	it('backfills the contacts too, so people are findable after the upgrade', () => {
		ensureSearchIndex(sqlite);

		const hit = sqlite
			.query("SELECT contact_id FROM contact_fts WHERE contact_fts MATCH 'steiner*'")
			.all() as { contact_id: string }[];
		expect(hit.map((h) => h.contact_id)).toEqual(['c-beat']);
	});
});
