import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import journal from '../../../../drizzle/meta/_journal.json';

/*
 * The status column lost its unset state (docs/02 §2.4): every row that is on record holds
 * unless it says `former`. The column is now NOT NULL, so the migration that introduces the
 * constraint has to carry the existing rows over — a null left behind would stop the app from
 * starting against a real database, which is why the backfill is driven here rather than
 * trusted (docs/08 §8.4.2).
 */

const STATUS_MIGRATION_TAG = '0008_tough_venom';
const STATEMENT_BREAK = '--> statement-breakpoint';

const tags = (journal as { entries: { tag: string }[] }).entries.map((e) => e.tag);
const upTo = tags.slice(0, tags.indexOf(STATUS_MIGRATION_TAG));

function apply(db: Database, tag: string): void {
	const sql = readFileSync(`./drizzle/${tag}.sql`, 'utf8');
	for (const statement of sql.split(STATEMENT_BREAK)) {
		const trimmed = statement.trim();
		if (trimmed) db.exec(trimmed);
	}
}

/** A database as it stood before the status column meant anything, with one row per case. */
function databaseBeforeTheMigration(): Database {
	const db = new Database(':memory:');
	db.exec('PRAGMA foreign_keys = OFF;');
	for (const tag of upTo) apply(db, tag);

	// One row per case, each on its own pair — the table holds a type only once per pair.
	for (const [id, other, status] of [
		['rel-unsaid', 'bert', null],
		['rel-junk', 'carl', 'complicated'],
		['rel-former', 'dora', 'former'],
		['rel-current', 'emil', 'current']
	] as const) {
		db.query(
			`INSERT INTO relationship
			 (id, household_id, from_contact_id, to_contact_id, type_id, status, created_by)
			 VALUES (?, 'h1', 'anna', ?, 'partner', ?, 'u1')`
		).run(id, other, status);
	}
	return db;
}

const statusOf = (db: Database, id: string): unknown =>
	(db.query('SELECT status FROM relationship WHERE id = ?').get(id) as { status: unknown }).status;

describe(`migration ${STATUS_MIGRATION_TAG}`, () => {
	it('carries every stored link over, and keeps only `former` as said', () => {
		const db = databaseBeforeTheMigration();
		expect(statusOf(db, 'rel-unsaid')).toBeNull();

		apply(db, STATUS_MIGRATION_TAG);

		expect(statusOf(db, 'rel-unsaid')).toBe('current');
		expect(statusOf(db, 'rel-junk')).toBe('current');
		expect(statusOf(db, 'rel-current')).toBe('current');
		expect(statusOf(db, 'rel-former')).toBe('former');
		db.close();
	});

	it('leaves no room for an unset status afterwards', () => {
		const db = databaseBeforeTheMigration();
		apply(db, STATUS_MIGRATION_TAG);
		// The migration turns foreign keys back on; these rows name no real contacts.
		db.exec('PRAGMA foreign_keys = OFF;');

		expect(() =>
			db
				.query(
					`INSERT INTO relationship
					 (id, household_id, from_contact_id, to_contact_id, type_id, status, created_by)
					 VALUES ('rel-new', 'h1', 'anna', 'frida', 'partner', NULL, 'u1')`
				)
				.run()
		).toThrow(/NOT NULL/);

		// A row that says nothing about the status is still allowed in, and says `current`.
		db.query(
			`INSERT INTO relationship
			 (id, household_id, from_contact_id, to_contact_id, type_id, created_by)
			 VALUES ('rel-quiet', 'h1', 'anna', 'gustav', 'partner', 'u1')`
		).run();
		expect(statusOf(db, 'rel-quiet')).toBe('current');
		db.close();
	});
});
