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
 * A parent link says its kind (docs/dev/03 §relationship): every one stored before reads as
 * biological, and afterwards the database holds the rule itself — a kind on a parent link and
 * only there, and only one of the four.
 */

const MIGRATIONS = './drizzle';
const TAG = '0048_relationship_parent_kind';
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
const oldLink = (id: string, to: string, typeId: string) =>
	sqlite
		.query(
			`INSERT INTO relationship (id, household_id, from_contact_id, to_contact_id, type_id, created_by)
			 VALUES (?, ?, 'anna', ?, ?, ?)`
		)
		.run(id, H, to, typeId, U);

const link = (id: string, to: string, typeId: string, kind: string | null) =>
	sqlite
		.query(
			`INSERT INTO relationship (id, household_id, from_contact_id, to_contact_id, type_id, parent_kind, created_by)
			 VALUES (?, ?, 'anna', ?, ?, ?, ?)`
		)
		.run(id, H, to, typeId, kind, U);

const kindOf = (id: string): unknown =>
	(
		sqlite.query('SELECT parent_kind FROM relationship WHERE id = ?').get(id) as {
			parent_kind: unknown;
		}
	).parent_kind;

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
	for (const id of ['anna', 'elias', 'mira']) {
		sqlite
			.query(
				`INSERT INTO contact (id, household_id, created_by, visibility, display_name) VALUES (?, ?, ?, 'shared', ?)`
			)
			.run(id, H, U, id);
	}
});

describe(TAG, () => {
	it('reads every parent link stored before as biological and leaves the others without a kind', () => {
		oldLink('r-parent', 'elias', 'parent_child');
		oldLink('r-friend', 'mira', 'friend');

		migrate(db, { migrationsFolder: MIGRATIONS });

		expect(kindOf('r-parent')).toBe('biological');
		expect(kindOf('r-friend')).toBeNull();
	});

	it('holds a kind on a parent link and only there, and only a known one', () => {
		migrate(db, { migrationsFolder: MIGRATIONS });

		link('r-foster', 'elias', 'parent_child', 'foster');
		expect(kindOf('r-foster')).toBe('foster');
		expect(() => link('r-bare', 'mira', 'parent_child', null)).toThrow(
			/CHECK constraint failed: relationship_parent_kind/
		);
		expect(() => link('r-odd', 'mira', 'parent_child', 'godparent')).toThrow(
			/CHECK constraint failed: relationship_parent_kind/
		);
		expect(() => link('r-friend', 'mira', 'friend', 'step')).toThrow(
			/CHECK constraint failed: relationship_parent_kind/
		);
	});

	it('refuses an update that leaves a kind on the wrong type or takes it off a parent link', () => {
		migrate(db, { migrationsFolder: MIGRATIONS });
		link('r-parent', 'elias', 'parent_child', 'adoptive');

		expect(() =>
			sqlite.query(`UPDATE relationship SET type_id = 'friend' WHERE id = 'r-parent'`).run()
		).toThrow(/CHECK constraint failed: relationship_parent_kind/);
		expect(() =>
			sqlite.query(`UPDATE relationship SET parent_kind = NULL WHERE id = 'r-parent'`).run()
		).toThrow(/CHECK constraint failed: relationship_parent_kind/);

		sqlite
			.query(`UPDATE relationship SET type_id = 'friend', parent_kind = NULL WHERE id = 'r-parent'`)
			.run();
		expect(kindOf('r-parent')).toBeNull();
	});
});
