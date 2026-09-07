import type { Database } from 'bun:sqlite';

/*
 * Full-text search index (docs/03 §3.5). Creates the FTS5 virtual tables and the triggers
 * that keep them in sync with `contact` and `note`, then backfills once for any pre-existing
 * rows. Idempotent: safe to run on every startup (IF NOT EXISTS + empty-check backfill).
 * Kept as raw SQL because FTS5 virtual tables are outside Drizzle's schema management.
 */

const contactContent = (t: string) =>
	`coalesce(${t}.display_name,'')||' '||coalesce(${t}.first_name,'')||' '||coalesce(${t}.last_name,'')||' '||coalesce(${t}.nickname,'')||' '||coalesce(${t}.description,'')||' '||coalesce(${t}.how_we_met,'')||' '||coalesce(${t}.met_place,'')`;

/*
 * What of a note is searchable. The body is stored with id-based @-mention tokens
 * (`@{contact:<id>}`, docs/02 §2.20.1), which are the wrong thing to index twice over: the
 * name the author typed is gone, and the literal word "contact" would sit in every note that
 * names anyone. So the token's syntax is stripped and the mentioned people's current display
 * names are appended instead. SQLite has no regex, so the strip is two `replace` calls and the
 * opaque id survives as an unsearched-for word — noise in the index, never a false hit for a
 * word anyone would type.
 */
const noteContent = (t: string) =>
	`coalesce(${t}.title,'')||' '||replace(replace(coalesce(${t}.body,''),'@{contact:',' '),'}',' ')||' '||coalesce((SELECT group_concat(c.display_name,' ') FROM note_mention m JOIN contact c ON c.id = m.contact_id WHERE m.note_id = ${t}.id),'')`;

/** Rebuild the index rows for the notes selected by `where`, evaluated against `note n`. */
const reindexNotes = (where: string) => `
			DELETE FROM note_fts WHERE note_id IN (SELECT n.id FROM note n WHERE ${where});
			INSERT INTO note_fts(note_id, contact_id, content)
				SELECT n.id, n.contact_id, ${noteContent('n')} FROM note n WHERE ${where};`;

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

		-- A note's mentions are written after the note itself, and rewritten whenever its body
		-- changes, so the index has to follow them rather than the note row alone.
		CREATE TRIGGER IF NOT EXISTS note_fts_mention_ai AFTER INSERT ON note_mention BEGIN${reindexNotes('n.id = new.note_id')}
		END;
		CREATE TRIGGER IF NOT EXISTS note_fts_mention_ad AFTER DELETE ON note_mention BEGIN${reindexNotes('n.id = old.note_id')}
		END;
		-- Renaming someone renames them in every note that mentions them, because only the id
		-- is stored (docs/02 §2.20.1) and the chip already reads the current name.
		CREATE TRIGGER IF NOT EXISTS note_fts_contact_au AFTER UPDATE OF display_name ON contact BEGIN${reindexNotes(
			'n.id IN (SELECT note_id FROM note_mention WHERE contact_id = new.id)'
		)}
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
