import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import {
	editJournalEntry,
	removeJournalEntry,
	saveJournalEntry,
	type JournalAuthor
} from '../domain/journal/journal';
import { fixedClock } from '../domain/testing';
import { createDrizzleEntryTagReads } from './entry-tag-reads';
import { readEntryTagsOnce } from './entry-tags';
import { createDrizzleJournalRepository } from './journal-repository';
import * as schema from './schema';

/*
 * Tags on journal entries against SQLite (docs/02 §2.20.2): the household's set follows what the
 * entries say — one tag per key in its first spelling, swept once nothing carries it — and a tag
 * is seen only by whoever can read an entry carrying it.
 */

const H = 'household-1';
const OTHER = 'household-2';
const U1 = 'user-1';
const U2 = 'user-2';
const one: JournalAuthor = { userId: U1, householdId: H, defaultVisibility: 'shared' };
const two: JournalAuthor = { userId: U2, householdId: H, defaultVisibility: 'shared' };
const viewerOne: Viewer = { id: U1, householdId: H };
const viewerTwo: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;
let n = 0;
const ids = { next: () => `id-${++n}` };

const deps = () => ({
	journal: createDrizzleJournalRepository(db, ids),
	media: { delete: async () => {} },
	ids,
	clock: fixedClock(1000)
});
const reads = () => createDrizzleEntryTagReads(db);

const write = (
	author: JournalAuthor,
	body: string,
	more: Partial<{ contactId: string; entryDate: string; visibility: 'shared' | 'private' }> = {}
) => saveJournalEntry(deps(), author, { contactId: 'kid', entryDate: '2026-07-11', body, ...more });

const tagRows = () =>
	db.select({ name: schema.entryTag.name, key: schema.entryTag.key }).from(schema.entryTag).all();

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household)
		.values([
			{ id: H, name: 'H' },
			{ id: OTHER, name: 'O' }
		])
		.run();
	db.insert(schema.user)
		.values([
			{ id: U1, householdId: H, email: 'u1@x.test', name: 'One' },
			{ id: U2, householdId: H, email: 'u2@x.test', name: 'Two' },
			{ id: 'stranger', householdId: OTHER, email: 's@x.test', name: 'S' }
		])
		.run();
	db.insert(schema.contact)
		.values([
			{ id: 'kid', householdId: H, createdBy: U1, visibility: 'shared', displayName: 'Kid' },
			{ id: 'mine', householdId: H, createdBy: U1, visibility: 'private', displayName: 'Mine' },
			{
				id: 'far',
				householdId: OTHER,
				createdBy: 'stranger',
				visibility: 'shared',
				displayName: 'Far'
			}
		])
		.run();
	n = 0;
});

describe('the household’s tag set', () => {
	it('keeps one tag per key, in the spelling it was first written in', async () => {
		await write(one, 'A #Holiday');
		await write(two, 'Our #holiday too');
		expect(tagRows()).toEqual([{ name: 'Holiday', key: 'holiday' }]);
	});

	it('sweeps a tag once an edit takes it off the last entry', async () => {
		const id = await write(one, '#lake and #walk');
		await editJournalEntry(deps(), one, { id, body: 'Just a #walk' });
		expect(tagRows().map((t) => t.name)).toEqual(['walk']);
	});

	it('sweeps the tags of a removed entry', async () => {
		const id = await write(one, '#lake');
		await removeJournalEntry(deps(), { ...viewerOne, isAdmin: false }, id);
		expect(tagRows()).toEqual([]);
	});

	it('keeps a tag another entry still carries', async () => {
		const id = await write(one, '#lake');
		await write(two, '#lake');
		await editJournalEntry(deps(), one, { id, body: 'nothing' });
		expect(tagRows().map((t) => t.name)).toEqual(['lake']);
	});

	it('keeps households apart: the same word is a tag in each', async () => {
		await write(one, '#lake');
		await saveJournalEntry(
			deps(),
			{ userId: 'stranger', householdId: OTHER, defaultVisibility: 'shared' },
			{
				contactId: 'far',
				entryDate: '2026-07-11',
				body: '#Lake'
			}
		);
		expect(
			tagRows()
				.map((t) => t.name)
				.sort()
		).toEqual(['Lake', 'lake']);
	});
});

describe('who sees a tag', () => {
	it('counts the entries carrying it that the viewer can read, most used first', async () => {
		await write(one, '#lake #walk');
		await write(two, '#lake');
		expect(await reads().listVisibleTo(viewerTwo)).toEqual([
			{ name: 'lake', key: 'lake', count: 2, onlyPrivate: false },
			{ name: 'walk', key: 'walk', count: 1, onlyPrivate: false }
		]);
	});

	it('shows a tag found only on private entries to their author alone, marked', async () => {
		await write(one, 'Secret #surprise', { visibility: 'private' });
		expect(await reads().listVisibleTo(viewerOne)).toEqual([
			{ name: 'surprise', key: 'surprise', count: 1, onlyPrivate: true }
		]);
		expect(await reads().listVisibleTo(viewerTwo)).toEqual([]);
	});

	it('is not private once a shared entry carries it', async () => {
		await write(one, '#gift', { visibility: 'private' });
		await write(two, '#gift');
		expect(await reads().listVisibleTo(viewerOne)).toEqual([
			{ name: 'gift', key: 'gift', count: 2, onlyPrivate: false }
		]);
	});

	it('hides the tags on a person private to someone else', async () => {
		await write(one, '#hidden', { contactId: 'mine' });
		expect(await reads().listVisibleTo(viewerTwo)).toEqual([]);
	});

	it('marks a tag private on one journal only when no other entry anywhere carries it', async () => {
		await write(one, '#plan', { visibility: 'private' });
		await write(two, '#plan', { contactId: 'kid', entryDate: '2026-07-12' });
		await write(one, '#own', { visibility: 'private', entryDate: '2026-07-13' });
		const onKid = await reads().listOnContactVisibleTo(viewerOne, 'kid');
		expect(onKid.map((t) => [t.name, t.onlyPrivate])).toEqual([
			['plan', false],
			['own', true]
		]);
	});

	it('lists one person’s tags for their journal', async () => {
		await write(one, '#lake');
		await write(one, '#elsewhere', { contactId: 'mine' });
		expect(await reads().listOnContactVisibleTo(viewerOne, 'kid')).toEqual([
			{ name: 'lake', key: 'lake', count: 1, onlyPrivate: false }
		]);
	});
});

describe('entries written before tags existed', () => {
	it('are read once on the first start, and not again', async () => {
		db.insert(schema.journalEntry)
			.values({
				id: 'old',
				contactId: 'kid',
				createdBy: U1,
				entryDate: '2026-01-01',
				body: 'An old #Trip'
			})
			.run();
		readEntryTagsOnce(db, ids);
		expect(tagRows()).toEqual([{ name: 'Trip', key: 'trip' }]);

		db.delete(schema.entryTag).run();
		readEntryTagsOnce(db, ids);
		expect(tagRows()).toEqual([]);
	});
});
