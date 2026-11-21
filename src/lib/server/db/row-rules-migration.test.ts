import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as schema from './schema';

/*
 * The rules a row must keep, held by the database itself (docs/dev/03 §3.1): a visibility is
 * shared or private, only a shared idea is kept from its person, a gift's state and a when are
 * known values, and a done day goes with its tick. A database that already holds a row breaking
 * one stops the migration and keeps every row as it was.
 */

const MIGRATIONS = './drizzle';
const TAG = '0046_row_rules';
const H = 'household-1';
const U = 'user-1';
const C = 'anna';

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
const note = (id: string, visibility: string) =>
	sqlite
		.query(
			`INSERT INTO note (id, contact_id, created_by, visibility, body) VALUES (?, ?, ?, ?, 'n')`
		)
		.run(id, C, U, visibility);

const gift = (
	id: string,
	fields: { visibility?: string; hidden?: number; state?: string; whenKind?: string | null }
) =>
	sqlite
		.query(
			`INSERT INTO gift (id, contact_id, created_by, visibility, hidden_from_recipient, state, title, when_kind)
			 VALUES (?, ?, ?, ?, ?, ?, 'Book', ?)`
		)
		.run(
			id,
			C,
			U,
			fields.visibility ?? 'shared',
			fields.hidden ?? 0,
			fields.state ?? 'idea',
			fields.whenKind ?? null
		);

const plan = (
	id: string,
	fields: { visibility?: string; hidden?: number; whenKind?: string | null }
) =>
	sqlite
		.query(
			`INSERT INTO activity_idea (id, contact_id, created_by, visibility, hidden_from_person, title, when_kind)
			 VALUES (?, ?, ?, ?, ?, 'Zoo', ?)`
		)
		.run(id, C, U, fields.visibility ?? 'shared', fields.hidden ?? 0, fields.whenKind ?? null);

const todo = (id: string, done: { at: number | null; on: string | null; by: string | null }) =>
	sqlite
		.query(
			`INSERT INTO todo (id, contact_id, created_by, title, done_at, done_on, done_by)
			 VALUES (?, ?, ?, 'Call', ?, ?, ?)`
		)
		.run(id, C, U, done.at, done.on, done.by);

const migrateAll = () => migrate(db, { migrationsFolder: MIGRATIONS });

beforeEach(() => {
	sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: migrationsBefore(TAG) });
	sqlite.query(`INSERT INTO household (id, name) VALUES (?, 'H')`).run(H);
	sqlite
		.query(`INSERT INTO user (id, household_id, email, name) VALUES (?, ?, 'u@x.test', 'U')`)
		.run(U, H);
	sqlite
		.query(
			`INSERT INTO contact (id, household_id, created_by, visibility, display_name) VALUES (?, ?, ?, 'shared', 'Anna')`
		)
		.run(C, H, U);
});

describe(TAG, () => {
	it('carries rows that keep the rules across untouched', () => {
		note('n-1', 'private');
		gift('g-1', { hidden: 1, state: 'bought', whenKind: 'later' });
		plan('p-1', { visibility: 'private', whenKind: 'on_date' });
		todo('t-open', { at: null, on: null, by: null });
		todo('t-done', { at: 5, on: '2026-11-01', by: U });
		todo('t-restored', { at: 5, on: '2026-11-01', by: null });

		migrateAll();

		expect(sqlite.query(`SELECT id, visibility FROM note`).all()).toEqual([
			{ id: 'n-1', visibility: 'private' }
		]);
		expect(sqlite.query(`SELECT id FROM todo ORDER BY id`).all()).toHaveLength(3);
	});

	it.each([
		['a visibility nobody knows', () => note('n-bad', 'household'), 'note_visibility'],
		[
			'a private surprise',
			() => gift('g-bad', { visibility: 'private', hidden: 1 }),
			'gift_surprise_shared'
		],
		[
			'a private idea kept from its person',
			() => plan('p-bad', { visibility: 'private', hidden: 1 }),
			'activity_idea_surprise_shared'
		],
		['a gift state nobody knows', () => gift('g-bad', { state: 'lost' }), 'gift_state'],
		[
			'a when nobody knows',
			() => plan('p-bad', { whenKind: 'someday' }),
			'activity_idea_when_kind'
		],
		[
			'a done day without its tick',
			() => todo('t-bad', { at: null, on: '2026-11-01', by: null }),
			'todo_done'
		],
		['a ticker without a tick', () => todo('t-bad', { at: null, on: null, by: U }), 'todo_done']
	])('stops on %s already stored and keeps it as it was', (_case, write, rule) => {
		write();
		const before = sqlite
			.query(`SELECT count(*) AS n FROM sqlite_master WHERE type = 'trigger'`)
			.get();

		expect(migrationFailure()).toMatch(new RegExp(`CHECK constraint failed: ${rule}`));

		expect(
			sqlite.query(`SELECT count(*) AS n FROM sqlite_master WHERE type = 'trigger'`).get()
		).toEqual(before);
		expect(sqlite.query(`SELECT count(*) AS n FROM __drizzle_migrations`).get()).toEqual({
			n: migrationsBeforeCount()
		});
	});

	it.each([
		['a visibility nobody knows', () => note('n-bad', 'household'), 'note_visibility'],
		[
			'a private surprise',
			() => gift('g-bad', { visibility: 'private', hidden: 1 }),
			'gift_surprise_shared'
		],
		[
			'a surprise flag that is not 0 or 1',
			() => gift('g-bad', { hidden: 2 }),
			'gift_surprise_shared'
		],
		['a gift state nobody knows', () => gift('g-bad', { state: 'lost' }), 'gift_state'],
		['a when nobody knows', () => gift('g-bad', { whenKind: 'someday' }), 'gift_when_kind'],
		['a tick without its day', () => todo('t-bad', { at: 5, on: null, by: U }), 'todo_done']
	])('refuses %s written afterwards', (_case, write, rule) => {
		migrateAll();

		expect(write).toThrow(new RegExp(`CHECK constraint failed: ${rule}`));
	});

	it('refuses an update that breaks a rule, and lets one that keeps them through', () => {
		migrateAll();
		gift('g-1', { hidden: 1 });
		plan('p-1', {});
		todo('t-1', { at: null, on: null, by: null });

		expect(() =>
			sqlite.query(`UPDATE gift SET visibility = 'private' WHERE id = 'g-1'`).run()
		).toThrow(/CHECK constraint failed: gift_surprise_shared/);
		expect(() =>
			sqlite.query(`UPDATE activity_idea SET when_kind = 'soon' WHERE id = 'p-1'`).run()
		).toThrow(/CHECK constraint failed: activity_idea_when_kind/);
		expect(() => sqlite.query(`UPDATE todo SET done_at = 5 WHERE id = 't-1'`).run()).toThrow(
			/CHECK constraint failed: todo_done/
		);

		sqlite
			.query(`UPDATE gift SET visibility = 'private', hidden_from_recipient = 0 WHERE id = 'g-1'`)
			.run();
		sqlite
			.query(`UPDATE todo SET done_at = 5, done_on = '2026-11-01', done_by = ? WHERE id = 't-1'`)
			.run(U);
		expect(sqlite.query(`SELECT visibility FROM gift WHERE id = 'g-1'`).get()).toEqual({
			visibility: 'private'
		});
		expect(sqlite.query(`SELECT done_by FROM todo WHERE id = 't-1'`).get()).toEqual({ done_by: U });
	});
});

/** Drizzle wraps what SQLite said in `cause`; the rule's name is there. */
function migrationFailure(): string {
	try {
		migrateAll();
	} catch (error) {
		return String((error as Error).cause);
	}
	throw new Error('the migration ran through');
}

function migrationsBeforeCount(): number {
	const journal = JSON.parse(
		readFileSync(join(MIGRATIONS, 'meta', '_journal.json'), 'utf8')
	) as Journal;
	return journal.entries.findIndex((entry) => entry.tag === TAG);
}
