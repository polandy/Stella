import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as schema from './schema';
import { seedRelationshipTypes } from './seed';

/*
 * The relationship table refuses a link from a person to themselves (docs/03 §relationship).
 * SQLite adds a CHECK only by rebuilding the table, and a self link already stored would stop
 * the copy; so the rebuild leaves such a link behind and carries every other row across as it
 * was, with the indexes that guard against duplicates.
 */

const MIGRATIONS = './drizzle';
const TAG = '0027_relationship_not_to_self';
const H = 'household-1';
const U = 'user-1';

interface Journal {
	entries: { tag: string }[];
}

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

let sqlite: Database;
let db: BunSQLiteDatabase<typeof schema>;

// Plain SQL: the schema as it is today may name columns a later migration adds.
const link = (id: string, from: string, to: string, typeId: string, note: string | null = null) =>
	sqlite
		.query(
			`INSERT INTO relationship (id, household_id, from_contact_id, to_contact_id, type_id, note, since_date, status, created_by, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, '2001-05-04', 'former', ?, 7, 8)`
		)
		.run(id, H, from, to, typeId, note, U);

const links = () =>
	sqlite
		.query(
			`SELECT id, household_id, from_contact_id, to_contact_id, type_id, note, since_date, status, created_by, created_at, updated_at
			 FROM relationship ORDER BY id`
		)
		.all();

beforeEach(() => {
	sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: migrationsBefore(TAG) });
	seedRelationshipTypes(db);
	sqlite.query(`INSERT INTO household (id, name) VALUES (?, 'H')`).run(H);
	sqlite
		.query(`INSERT INTO user (id, household_id, email, name) VALUES (?, ?, 'u@x.test', 'U')`)
		.run(U, H);
	for (const id of ['anna', 'elias']) {
		sqlite
			.query(
				`INSERT INTO contact (id, household_id, created_by, visibility, display_name) VALUES (?, ?, ?, 'shared', ?)`
			)
			.run(id, H, U, id);
	}
});

describe(TAG, () => {
	it('drops a link from a person to themselves and keeps a link between two, field for field', () => {
		link('r-self', 'anna', 'anna', 'friend');
		link('r-real', 'anna', 'elias', 'parent_child', 'met at uni');

		migrate(db, { migrationsFolder: MIGRATIONS });

		expect(links()).toEqual([
			{
				id: 'r-real',
				household_id: H,
				from_contact_id: 'anna',
				to_contact_id: 'elias',
				type_id: 'parent_child',
				note: 'met at uni',
				since_date: '2001-05-04',
				status: 'former',
				created_by: U,
				created_at: 7,
				updated_at: 8
			}
		]);
	});

	it('refuses a self link afterwards, and still refuses a duplicate', () => {
		migrate(db, { migrationsFolder: MIGRATIONS });

		expect(() => link('r-self', 'anna', 'anna', 'friend')).toThrow(
			/CHECK constraint failed: relationship_not_to_self/
		);
		link('r-real', 'anna', 'elias', 'friend');
		expect(() => link('r-twin', 'anna', 'elias', 'friend')).toThrow(/UNIQUE constraint failed/);
		expect(links()).toMatchObject([{ id: 'r-real' }]);
	});

	it('takes a person’s links with them when they are deleted, as before', () => {
		link('r-real', 'anna', 'elias', 'friend');
		migrate(db, { migrationsFolder: MIGRATIONS });
		expect(links()).toMatchObject([{ id: 'r-real' }]);

		sqlite.query(`DELETE FROM contact WHERE id = 'elias'`).run();

		expect(links()).toEqual([]);
	});
});
