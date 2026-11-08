import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/*
 * The day slot moved from the anchor to the set of people (docs/02 §2.20.3, ADR-131): a stored
 * entry must come through with `subject_key` = its `contact_id`, or the household's journals
 * would not start. Driven on Drizzle's own migrator over rows, as `db/index.ts` runs it.
 */

const MIGRATIONS = './drizzle';
const TAG = '0039_household_moment';
const H = 'household-1';
const U1 = 'user-1';

function migrationsBefore(tag: string): string {
	const folder = mkdtempSync(join(tmpdir(), 'stella-migrations-'));
	cpSync(MIGRATIONS, folder, { recursive: true });
	const journalPath = join(folder, 'meta', '_journal.json');
	const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { tag: string }[] };
	journal.entries = journal.entries.slice(
		0,
		journal.entries.findIndex((entry) => entry.tag === tag)
	);
	writeFileSync(journalPath, JSON.stringify(journal));
	return folder;
}

function journalBeforeTheMigration(): Database {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	migrate(drizzle(sqlite), { migrationsFolder: migrationsBefore(TAG) });
	sqlite.query('INSERT INTO household (id, name) VALUES (?, ?)').run(H, 'Home');
	sqlite
		.query('INSERT INTO user (id, household_id, email, name) VALUES (?, ?, ?, ?)')
		.run(U1, H, 'one@x.test', 'One');
	for (const person of ['anna', 'bert']) {
		sqlite
			.query(
				`INSERT INTO contact (id, household_id, created_by, visibility, display_name)
				 VALUES (?, ?, ?, 'shared', ?)`
			)
			.run(person, H, U1, person);
	}
	for (const [id, person] of [
		['e-anna', 'anna'],
		['e-bert', 'bert']
	]) {
		sqlite
			.query(
				`INSERT INTO journal_entry (id, contact_id, created_by, visibility, entry_date, body)
				 VALUES (?, ?, ?, 'shared', '2026-11-01', 'Hi')`
			)
			.run(id, person, U1);
	}
	return sqlite;
}

describe(`migration ${TAG}`, () => {
	it('keys every stored entry by its one person, so each keeps its slot', () => {
		const db = journalBeforeTheMigration();
		migrate(drizzle(db), { migrationsFolder: MIGRATIONS });

		expect(db.query('SELECT id, subject_key FROM journal_entry ORDER BY id').all()).toEqual([
			{ id: 'e-anna', subject_key: 'anna' },
			{ id: 'e-bert', subject_key: 'bert' }
		]);
		expect(() =>
			db
				.query(
					`INSERT INTO journal_entry (id, contact_id, subject_key, created_by, visibility, entry_date, body)
					 VALUES ('e-again', 'anna', 'anna', ?, 'shared', '2026-11-01', 'Again')`
				)
				.run(U1)
		).toThrow(/UNIQUE/);
		// The same anchor about more people is another slot.
		db.query(
			`INSERT INTO journal_entry (id, contact_id, subject_key, created_by, visibility, entry_date, body)
			 VALUES ('e-both', 'anna', 'anna,bert', ?, 'shared', '2026-11-01', 'Both')`
		).run(U1);
		db.close();
	});
});
