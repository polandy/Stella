import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { foldedLinkDetails } from '../../relationships/fold';
import * as schema from './schema';
import { seedRelationshipTypes } from './seed';

/*
 * Before a merge put moved links into stored order, it repointed one column at a time and could
 * leave a symmetric link unsorted — next to a sorted twin the survivor already had (docs/03
 * §relationship). The migration puts what such merges left right once: a twin keeps its row
 * and takes the blanks the unsorted copy can fill (the merge's own rule, `foldedLinkDetails`),
 * the copy goes, and every other unsorted symmetric link is turned round. Directed links are
 * never touched: their order is their meaning.
 */

const MIGRATIONS = './drizzle';
const TAG = '0025_sort_symmetric_links';
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

let db: BunSQLiteDatabase<typeof schema>;

const link = (
	id: string,
	fromContactId: string,
	toContactId: string,
	typeId: string,
	fields: Partial<typeof schema.relationship.$inferInsert> = {}
) =>
	db
		.insert(schema.relationship)
		.values({ id, householdId: H, fromContactId, toContactId, typeId, createdBy: U, ...fields })
		.run();

const links = () =>
	db
		.select()
		.from(schema.relationship)
		.all()
		.sort((a, b) => a.id.localeCompare(b.id));

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: migrationsBefore(TAG) });
	seedRelationshipTypes(db);
	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user).values({ id: U, householdId: H, email: 'u@x.test', name: 'U' }).run();
	// Plain SQL: the schema as it is today names columns a later migration adds.
	for (const id of ['anna', 'elias', 'keep', 'lena']) {
		sqlite
			.query(
				`INSERT INTO contact (id, household_id, created_by, visibility, display_name) VALUES (?, ?, ?, 'shared', ?)`
			)
			.run(id, H, U, id);
	}
});

describe(TAG, () => {
	it('turns round a symmetric link a merge left unsorted', () => {
		link('r-moved', 'keep', 'elias', 'friend', { note: 'school', updatedAt: 1 });

		migrate(db, { migrationsFolder: MIGRATIONS });

		expect(links()).toMatchObject([
			{ id: 'r-moved', fromContactId: 'elias', toContactId: 'keep', note: 'school', updatedAt: 1 }
		]);
	});

	it('folds an unsorted copy into the sorted twin, which takes only the blanks it can fill', () => {
		const copy = { note: 'met at uni', sinceDate: '2004-09-01' };
		const twin = { note: null, sinceDate: '1999-01-01' };
		link('r-moved', 'keep', 'elias', 'friend', copy);
		link('r-twin', 'elias', 'keep', 'friend', { ...twin, status: 'former' });

		migrate(db, { migrationsFolder: MIGRATIONS });

		const filled = foldedLinkDetails(
			{ description: twin.note, sinceDate: twin.sinceDate },
			{ description: copy.note, sinceDate: copy.sinceDate }
		);
		expect(links()).toEqual([
			expect.objectContaining({
				id: 'r-twin',
				fromContactId: 'elias',
				toContactId: 'keep',
				note: filled.description ?? twin.note,
				sinceDate: filled.sinceDate ?? twin.sinceDate,
				status: 'former'
			})
		]);
		expect(links()[0]).toMatchObject({ note: 'met at uni', sinceDate: '1999-01-01' });
	});

	it('treats an empty description on the twin as blank', () => {
		link('r-moved', 'keep', 'elias', 'friend', { note: 'met at uni' });
		link('r-twin', 'elias', 'keep', 'friend', { note: '' });

		migrate(db, { migrationsFolder: MIGRATIONS });

		expect(links()).toMatchObject([{ id: 'r-twin', note: 'met at uni' }]);
	});

	it('leaves sorted symmetric links and every directed link as they were', () => {
		// Positive control: nothing here is out of order, so nothing changes.
		link('r-sorted', 'anna', 'lena', 'sibling', { updatedAt: 1 });
		link('r-parent', 'lena', 'elias', 'parent_child', { updatedAt: 1 });
		link('r-back', 'elias', 'lena', 'grandparent_grandchild', { updatedAt: 1 });

		migrate(db, { migrationsFolder: MIGRATIONS });

		expect(links()).toMatchObject([
			{ id: 'r-back', fromContactId: 'elias', toContactId: 'lena', updatedAt: 1 },
			{ id: 'r-parent', fromContactId: 'lena', toContactId: 'elias', updatedAt: 1 },
			{ id: 'r-sorted', fromContactId: 'anna', toContactId: 'lena', updatedAt: 1 }
		]);
	});

	it('keeps a link of another type between the same two', () => {
		link('r-moved', 'keep', 'elias', 'friend');
		link('r-colleague', 'elias', 'keep', 'colleague');

		migrate(db, { migrationsFolder: MIGRATIONS });

		expect(links()).toMatchObject([
			{ id: 'r-colleague', fromContactId: 'elias', toContactId: 'keep', typeId: 'colleague' },
			{ id: 'r-moved', fromContactId: 'elias', toContactId: 'keep', typeId: 'friend' }
		]);
	});
});
