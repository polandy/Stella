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

	it('keeps an imported contact\'s source id out of the index, tokens and all', () => {
		// An imported contact keeps its source id, whose ':' separators the FTS tokenizer would
		// otherwise read as the searchable words "monica", "contact" and "9" (docs/02 §2.16).
		db.insert(schema.contact)
			.values({ id: 'monica:contact:9', householdId: H, createdBy: U, visibility: 'shared', displayName: 'Janosch Rohdewald' })
			.run();
		db.insert(schema.note)
			.values({
				id: 'n-2',
				contactId: 'c-beat',
				createdBy: U,
				visibility: 'shared',
				body: 'called @{contact:monica:contact:9} twice'
			})
			.run();
		db.insert(schema.noteMention).values({ noteId: 'n-2', contactId: 'monica:contact:9' }).run();

		ensureSearchIndex(sqlite);

		const content = indexed('n-2');
		expect(content).toContain('called');
		expect(content).toContain('Janosch Rohdewald'); // the name is what the index carries
		expect(content).not.toContain('monica');
		expect(content).not.toContain('contact');
		// Positive control: the words the id would have contributed match no note at all.
		const hits = sqlite
			.query("SELECT note_id FROM note_fts WHERE note_fts MATCH 'monica OR contact'")
			.all() as { note_id: string }[];
		expect(hits).toEqual([]);
	});

	it('leaves the rest of the body untouched while stripping a token', () => {
		db.insert(schema.note)
			.values({ id: 'n-3', contactId: 'c-beat', createdBy: U, visibility: 'shared', body: 'met @{contact:c-sandra} at 10:30 sharp' })
			.run();
		db.insert(schema.noteMention).values({ noteId: 'n-3', contactId: 'c-sandra' }).run();

		ensureSearchIndex(sqlite);

		expect(indexed('n-3')).toContain('10:30 sharp');
	});

	it('backfills the contacts too, so people are findable after the upgrade', () => {
		ensureSearchIndex(sqlite);

		const hit = sqlite
			.query("SELECT contact_id FROM contact_fts WHERE contact_fts MATCH 'steiner*'")
			.all() as { contact_id: string }[];
		expect(hit.map((h) => h.contact_id)).toEqual(['c-beat']);
	});
});

/*
 * The upgrade path. `IF NOT EXISTS` makes a first run cheap but a *changed* definition
 * invisible: an existing database keeps the triggers and the index content an older Stella
 * wrote, so a fix to what gets indexed would never reach the databases that have the problem.
 * `ensureSearchIndex` therefore fingerprints its own definitions and rebuilds when they move.
 */
describe('ensureSearchIndex upgrade', () => {
	/** What an older Stella left behind: its triggers, its index rows, and no fingerprint. */
	function pretendOlderVersionBuiltTheIndex(): void {
		ensureSearchIndex(sqlite);
		sqlite.exec('DROP TABLE IF EXISTS search_index_meta');
		sqlite.exec('DROP TRIGGER note_fts_ai');
		// The old definition: the raw body, mention tokens and all.
		sqlite.exec(`CREATE TRIGGER note_fts_ai AFTER INSERT ON note BEGIN
			INSERT INTO note_fts(note_id, contact_id, content) VALUES (new.id, new.contact_id, coalesce(new.body,''));
		END;`);
		sqlite.exec("UPDATE note_fts SET content = 'walked home with @{contact:c-sandra}' WHERE note_id = 'n-1'");
	}

	it('rebuilds index rows an older definition wrote', () => {
		pretendOlderVersionBuiltTheIndex();

		ensureSearchIndex(sqlite);

		const content = indexed('n-1');
		expect(content).not.toContain('@{contact:');
		expect(content).toContain('Sandra Keller');
	});

	it('replaces the older triggers, so the next write is indexed the current way', () => {
		pretendOlderVersionBuiltTheIndex();
		ensureSearchIndex(sqlite);

		db.insert(schema.note)
			.values({ id: 'n-9', contactId: 'c-beat', createdBy: U, visibility: 'shared', body: 'saw @{contact:c-sandra}' })
			.run();

		expect(indexed('n-9')).not.toContain('@{contact:');
	});

	it('leaves an unchanged definition alone, so a restart is not a rebuild', () => {
		ensureSearchIndex(sqlite);
		sqlite.exec("UPDATE note_fts SET content = 'edited by hand' WHERE note_id = 'n-1'");

		ensureSearchIndex(sqlite);

		expect(indexed('n-1')).toBe('edited by hand');
	});
});
