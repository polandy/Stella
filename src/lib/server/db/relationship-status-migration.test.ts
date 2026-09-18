import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/*
 * The status column lost its unset state (docs/02 §2.4): every link that is on record holds
 * unless it says `former`. The column is now NOT NULL, which makes this the first migration in
 * Stella that rebuilds a table rather than adding to one — the rows are copied into a new table
 * and the old one is dropped. A null left behind, or a copy that the foreign keys refuse, would
 * stop the app from starting against the household's real database, so this is driven rather
 * than trusted (docs/08 §8.4.2).
 *
 * It runs the way `db/index.ts` does: Drizzle's own migrator, foreign keys on, over a database
 * that already holds rows. Applying the statements by hand would prove far less — the pragma
 * the migration opens with is a no-op inside a transaction, so whether the copy passes the
 * foreign keys can only be answered on the real path.
 */

const MIGRATIONS = './drizzle';
const STATUS_MIGRATION_TAG = '0008_tough_venom';
const H = 'household-1';
const U1 = 'user-1';

interface Journal {
	entries: { tag: string }[];
}

/** The migrations folder as it stood before this one — what a running installation has applied. */
function migrationsBefore(tag: string): string {
	const folder = mkdtempSync(join(tmpdir(), 'stella-migrations-'));
	cpSync(MIGRATIONS, folder, { recursive: true });
	const journalPath = join(folder, 'meta', '_journal.json');
	const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as Journal;
	journal.entries = journal.entries.slice(
		0,
		journal.entries.findIndex((entry) => entry.tag === tag)
	);
	writeFileSync(journalPath, JSON.stringify(journal));
	return folder;
}

/**
 * A household as it stood before the migration: four links, one per case the column can hold.
 * Their people and type are real rows, so the copy has to satisfy the foreign keys.
 */
function householdBeforeTheMigration(): Database {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	migrate(drizzle(sqlite), { migrationsFolder: migrationsBefore(STATUS_MIGRATION_TAG) });

	sqlite.query('INSERT INTO household (id, name) VALUES (?, ?)').run(H, 'Home');
	sqlite
		.query('INSERT INTO user (id, household_id, email, name) VALUES (?, ?, ?, ?)')
		.run(U1, H, 'one@x.test', 'One');
	sqlite
		.query(
			`INSERT INTO relationship_type
			 (id, household_id, key, forward_label, reverse_label, category, symmetric, sort_order)
			 VALUES ('partner', NULL, 'partner', 'Partner of', 'Partner of', 'family', 1, 10)`
		)
		.run();
	for (const person of ['anna', 'bert', 'carl', 'dora', 'emil']) {
		sqlite
			.query(
				`INSERT INTO contact (id, household_id, created_by, visibility, display_name)
				 VALUES (?, ?, ?, 'shared', ?)`
			)
			.run(person, H, U1, person);
	}
	// One link per case, each on its own pair — the table holds a type only once per pair.
	for (const [id, other, status] of [
		['rel-unsaid', 'bert', null],
		['rel-junk', 'carl', 'complicated'],
		['rel-former', 'dora', 'former'],
		['rel-current', 'emil', 'current']
	] as const) {
		sqlite
			.query(
				`INSERT INTO relationship
				 (id, household_id, from_contact_id, to_contact_id, type_id, status, created_by)
				 VALUES (?, ?, 'anna', ?, 'partner', ?, ?)`
			)
			.run(id, H, other, status, U1);
	}
	return sqlite;
}

const statusOf = (db: Database, id: string): unknown =>
	(db.query('SELECT status FROM relationship WHERE id = ?').get(id) as { status: unknown }).status;

const applyStatusMigration = (db: Database): void =>
	migrate(drizzle(db), { migrationsFolder: MIGRATIONS });

describe(`migration ${STATUS_MIGRATION_TAG}`, () => {
	it('carries every stored link over, and keeps only `former` as said', () => {
		const db = householdBeforeTheMigration();
		expect(statusOf(db, 'rel-unsaid')).toBeNull();

		applyStatusMigration(db);

		expect(statusOf(db, 'rel-unsaid')).toBe('current');
		expect(statusOf(db, 'rel-junk')).toBe('current');
		expect(statusOf(db, 'rel-current')).toBe('current');
		expect(statusOf(db, 'rel-former')).toBe('former');
		db.close();
	});

	it('leaves the links whole — the rebuilt table keeps its people, and their people keep it', () => {
		const db = householdBeforeTheMigration();

		applyStatusMigration(db);

		expect(db.query('SELECT count(*) AS n FROM relationship').get()).toEqual({ n: 4 });
		// The copy ran with foreign keys enforced, and the endpoints still resolve afterwards.
		expect(
			db
				.query(
					`SELECT count(*) AS n FROM relationship r
					 JOIN contact a ON a.id = r.from_contact_id
					 JOIN contact b ON b.id = r.to_contact_id`
				)
				.get()
		).toEqual({ n: 4 });
		// Removing a person still takes their links with them: the rebuilt table kept the rule.
		db.query('DELETE FROM contact WHERE id = ?').run('bert');
		expect(db.query('SELECT count(*) AS n FROM relationship').get()).toEqual({ n: 3 });
		db.close();
	});

	it('leaves no room for an unset status afterwards', () => {
		const db = householdBeforeTheMigration();
		applyStatusMigration(db);

		expect(() =>
			db
				.query(
					`INSERT INTO relationship
					 (id, household_id, from_contact_id, to_contact_id, type_id, status, created_by)
					 VALUES ('rel-new', ?, 'anna', 'dora', 'partner', NULL, ?)`
				)
				.run(H, U1)
		).toThrow(/NOT NULL/);

		// A row that says nothing about the status is still allowed in, and says `current`.
		db.query(
			`INSERT INTO relationship
			 (id, household_id, from_contact_id, to_contact_id, type_id, created_by)
			 VALUES ('rel-quiet', ?, 'bert', 'carl', 'partner', ?)`
		).run(H, U1);
		expect(statusOf(db, 'rel-quiet')).toBe('current');
		db.close();
	});
});
