import type { Database } from 'bun:sqlite';

/*
 * Full-text search index (docs/03 §3.5). Creates the FTS5 virtual tables and the triggers that
 * keep them in sync with `contact` and `note`, and builds the rows for everything already
 * stored. Runs on every startup and does nothing when the index on disk was built from the
 * same definitions — see `fingerprint`. Kept as raw SQL because FTS5 virtual tables are
 * outside Drizzle's schema management.
 */

const contactContent = (t: string) =>
	`coalesce(${t}.display_name,'')||' '||coalesce(${t}.first_name,'')||' '||coalesce(${t}.last_name,'')||' '||coalesce(${t}.nickname,'')||' '||coalesce(${t}.description,'')||' '||coalesce(${t}.how_we_met,'')||' '||coalesce(${t}.met_place,'')`;

/** The mention token's opening, whose closing `}` ends it (docs/02 §2.20.1). */
const MENTION_OPEN = '@{contact:';

/*
 * A body with its @-mention tokens cut out, as one SQL expression. The tokens are the wrong
 * thing to index: the name the author typed is gone, and what is left is the contact id — the
 * literal word "contact" in every note that names anyone, plus, for an imported contact whose
 * id is a source id (`monica:contact:9`, docs/02 §2.16), the words "monica" and "contact"
 * again, which are words someone really does type into the search box. SQLite has no regex, so
 * the cut is a recursive strip of one token at a time: find the opening, find the `}` that
 * closes it, keep what is on either side. It stops on a body with no token left and on a
 * malformed one whose opening is never closed, so it cannot spin.
 */
const strippedBody = (t: string) => `(WITH RECURSIVE strip(s) AS (
			SELECT coalesce(${t}.body,'')
			UNION ALL
			SELECT substr(s,1,instr(s,'${MENTION_OPEN}')-1)||' '||substr(s,instr(s,'${MENTION_OPEN}')+instr(substr(s,instr(s,'${MENTION_OPEN}')),'}'))
			FROM strip WHERE instr(s,'${MENTION_OPEN}')>0 AND instr(substr(s,instr(s,'${MENTION_OPEN}')),'}')>0
		) SELECT s FROM strip WHERE instr(s,'${MENTION_OPEN}')=0 OR instr(substr(s,instr(s,'${MENTION_OPEN}')),'}')=0 LIMIT 1)`;

/*
 * What of a note is searchable: its title, its body without the mention tokens, and the
 * mentioned people's *current* display names in their place — so a note is findable by the
 * name it reads as, and a rename follows (the `note_fts_contact_au` trigger).
 */
const noteContent = (t: string) =>
	`coalesce(${t}.title,'')||' '||${strippedBody(t)}||' '||coalesce((SELECT group_concat(c.display_name,' ') FROM note_mention m JOIN contact c ON c.id = m.contact_id WHERE m.note_id = ${t}.id),'')`;

/** Rebuild the index rows for the notes selected by `where`, evaluated against `note n`. */
const reindexNotes = (where: string) => `
			DELETE FROM note_fts WHERE note_id IN (SELECT n.id FROM note n WHERE ${where});
			INSERT INTO note_fts(note_id, contact_id, content)
				SELECT n.id, n.contact_id, ${noteContent('n')} FROM note n WHERE ${where};`;

/** The triggers that keep the index in step with `contact`, `note` and `note_mention`. */
const TRIGGERS: Record<string, string> = {
	contact_fts_ai: `AFTER INSERT ON contact BEGIN
			INSERT INTO contact_fts(contact_id, content) VALUES (new.id, ${contactContent('new')});
		END`,
	contact_fts_ad: `AFTER DELETE ON contact BEGIN
			DELETE FROM contact_fts WHERE contact_id = old.id;
		END`,
	contact_fts_au: `AFTER UPDATE ON contact BEGIN
			DELETE FROM contact_fts WHERE contact_id = old.id;
			INSERT INTO contact_fts(contact_id, content) VALUES (new.id, ${contactContent('new')});
		END`,
	note_fts_ai: `AFTER INSERT ON note BEGIN
			INSERT INTO note_fts(note_id, contact_id, content) VALUES (new.id, new.contact_id, ${noteContent('new')});
		END`,
	note_fts_ad: `AFTER DELETE ON note BEGIN
			DELETE FROM note_fts WHERE note_id = old.id;
		END`,
	note_fts_au: `AFTER UPDATE ON note BEGIN
			DELETE FROM note_fts WHERE note_id = old.id;
			INSERT INTO note_fts(note_id, contact_id, content) VALUES (new.id, new.contact_id, ${noteContent('new')});
		END`,
	// A note's mentions are written after the note itself, and rewritten whenever its body
	// changes, so the index has to follow them rather than the note row alone.
	note_fts_mention_ai: `AFTER INSERT ON note_mention BEGIN${reindexNotes('n.id = new.note_id')}
		END`,
	note_fts_mention_ad: `AFTER DELETE ON note_mention BEGIN${reindexNotes('n.id = old.note_id')}
		END`,
	// Renaming someone renames them in every note that mentions them, because only the id
	// is stored (docs/02 §2.20.1) and the chip already reads the current name.
	note_fts_contact_au: `AFTER UPDATE OF display_name ON contact BEGIN${reindexNotes(
		'n.id IN (SELECT note_id FROM note_mention WHERE contact_id = new.id)'
	)}
		END`
};

/** The FTS5 virtual tables. Outside Drizzle's schema management, hence the raw DDL. */
const TABLES = `
		CREATE VIRTUAL TABLE IF NOT EXISTS contact_fts USING fts5(
			contact_id UNINDEXED, content, tokenize='unicode61 remove_diacritics 2'
		);
		CREATE VIRTUAL TABLE IF NOT EXISTS note_fts USING fts5(
			note_id UNINDEXED, contact_id UNINDEXED, content, tokenize='unicode61 remove_diacritics 2'
		);`;

/** Everything the index is made of, as one string — the input to the fingerprint. */
const definition = (): string =>
	TABLES +
	Object.entries(TRIGGERS)
		.map(([name, body]) => `CREATE TRIGGER ${name} ${body};`)
		.join('') +
	contactContent('contact') +
	noteContent('note');

/**
 * A content-addressed stamp of the definitions above. Stored beside the index so a startup can
 * tell "already built" from "built by a Stella that indexed something else": what a trigger
 * writes is baked into the trigger at creation time, so a changed definition is invisible until
 * the triggers are replaced and the rows rebuilt. Any edit to the SQL above moves the stamp and
 * upgrades every existing database on its next start — there is no version number to remember.
 */
function fingerprint(): string {
	return new Bun.CryptoHasher('sha256').update(definition()).digest('hex');
}

/** Where that stamp lives. Its own tiny table, like the FTS tables outside Drizzle. */
const META_TABLE = 'search_index_meta';

function storedFingerprint(sqlite: Database): string | null {
	const row = sqlite.query(`SELECT fingerprint AS f FROM ${META_TABLE} LIMIT 1`).get() as
		| { f: string }
		| null;
	return row?.f ?? null;
}

/** Drop and re-create every trigger, so they carry the current definition. */
function recreateTriggers(sqlite: Database): void {
	sqlite.exec(
		Object.entries(TRIGGERS)
			.map(([name, body]) => `DROP TRIGGER IF EXISTS ${name};CREATE TRIGGER ${name} ${body};`)
			.join('\n')
	);
}

/** Throw away the index and build it from the tables of record. */
function rebuild(sqlite: Database): void {
	sqlite.exec(`
		DELETE FROM contact_fts;
		INSERT INTO contact_fts(contact_id, content) SELECT id, ${contactContent('contact')} FROM contact;
		DELETE FROM note_fts;
		INSERT INTO note_fts(note_id, contact_id, content) SELECT id, contact_id, ${noteContent('note')} FROM note;`);
}

/**
 * Create the search index if it is missing and bring it up to date if this Stella indexes
 * something other than the one on disk. Idempotent: a restart on an unchanged definition
 * touches nothing.
 */
export function ensureSearchIndex(sqlite: Database): void {
	sqlite.exec(TABLES);
	sqlite.exec(`CREATE TABLE IF NOT EXISTS ${META_TABLE} (fingerprint TEXT NOT NULL);`);

	const current = fingerprint();
	if (storedFingerprint(sqlite) === current) return;

	recreateTriggers(sqlite);
	rebuild(sqlite);
	sqlite.exec(`DELETE FROM ${META_TABLE};`);
	sqlite.query(`INSERT INTO ${META_TABLE}(fingerprint) VALUES (?)`).run(current);
}
