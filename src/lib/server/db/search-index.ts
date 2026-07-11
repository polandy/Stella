import type { Database } from 'bun:sqlite';

/*
 * Full-text search index (docs/03 §3.5). Creates the FTS5 virtual tables and the triggers
 * that keep them in sync with `contact` and `note`, then backfills once for any pre-existing
 * rows. Idempotent: safe to run on every startup (IF NOT EXISTS + empty-check backfill).
 * Kept as raw SQL because FTS5 virtual tables are outside Drizzle's schema management.
 */

const contactContent = (t: string) =>
	`coalesce(${t}.display_name,'')||' '||coalesce(${t}.first_name,'')||' '||coalesce(${t}.last_name,'')||' '||coalesce(${t}.nickname,'')||' '||coalesce(${t}.description,'')||' '||coalesce(${t}.how_we_met,'')||' '||coalesce(${t}.met_place,'')`;

const noteContent = (t: string) => `coalesce(${t}.title,'')||' '||coalesce(${t}.body,'')`;

export function ensureSearchIndex(sqlite: Database): void {
	sqlite.exec(`
		CREATE VIRTUAL TABLE IF NOT EXISTS contact_fts USING fts5(
			contact_id UNINDEXED, content, tokenize='unicode61 remove_diacritics 2'
		);
		CREATE TRIGGER IF NOT EXISTS contact_fts_ai AFTER INSERT ON contact BEGIN
			INSERT INTO contact_fts(contact_id, content) VALUES (new.id, ${contactContent('new')});
		END;
		CREATE TRIGGER IF NOT EXISTS contact_fts_ad AFTER DELETE ON contact BEGIN
			DELETE FROM contact_fts WHERE contact_id = old.id;
		END;
		CREATE TRIGGER IF NOT EXISTS contact_fts_au AFTER UPDATE ON contact BEGIN
			DELETE FROM contact_fts WHERE contact_id = old.id;
			INSERT INTO contact_fts(contact_id, content) VALUES (new.id, ${contactContent('new')});
		END;

		CREATE VIRTUAL TABLE IF NOT EXISTS note_fts USING fts5(
			note_id UNINDEXED, contact_id UNINDEXED, content, tokenize='unicode61 remove_diacritics 2'
		);
		CREATE TRIGGER IF NOT EXISTS note_fts_ai AFTER INSERT ON note BEGIN
			INSERT INTO note_fts(note_id, contact_id, content) VALUES (new.id, new.contact_id, ${noteContent('new')});
		END;
		CREATE TRIGGER IF NOT EXISTS note_fts_ad AFTER DELETE ON note BEGIN
			DELETE FROM note_fts WHERE note_id = old.id;
		END;
		CREATE TRIGGER IF NOT EXISTS note_fts_au AFTER UPDATE ON note BEGIN
			DELETE FROM note_fts WHERE note_id = old.id;
			INSERT INTO note_fts(note_id, contact_id, content) VALUES (new.id, new.contact_id, ${noteContent('new')});
		END;
	`);

	const contactCount = (sqlite.query('SELECT count(*) AS c FROM contact_fts').get() as { c: number }).c;
	if (contactCount === 0) {
		sqlite.exec(`INSERT INTO contact_fts(contact_id, content) SELECT id, ${contactContent('contact')} FROM contact;`);
	}
	const noteCount = (sqlite.query('SELECT count(*) AS c FROM note_fts').get() as { c: number }).c;
	if (noteCount === 0) {
		sqlite.exec(`INSERT INTO note_fts(note_id, contact_id, content) SELECT id, contact_id, ${noteContent('note')} FROM note;`);
	}
}
