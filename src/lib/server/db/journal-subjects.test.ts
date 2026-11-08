import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import {
	editJournalEntry,
	listJournalForContact,
	saveJournalEntry,
	type JournalAuthor
} from '../domain/journal/journal';
import { createDrizzleJournalPhotoReads } from './journal-photo-reads';
import { createDrizzleJournalRepository } from './journal-repository';
import { replaceSubjectEverywhere } from './journal-subjects';
import * as schema from './schema';

/*
 * A moment about several people against real SQLite (docs/02 §2.20.3, ADR-131): it reads on
 * every subject's page, an edit of its people re-anchors it or joins it with the author's entry
 * about the same people, and a merge or a deleted person takes one subject out and leaves the
 * moment to the rest.
 */

const H = 'household-1';
const U1 = 'user-1';
const author: JournalAuthor = { userId: U1, householdId: H, defaultVisibility: 'shared' };
const viewer: Viewer = { id: U1, householdId: H };
const DAY = '2026-07-11';

let db: BunSQLiteDatabase<typeof schema>;
let n = 0;

function deps() {
	const ids = { next: () => `j-${++n}` };
	return { journal: createDrizzleJournalRepository(db, ids), ids, clock: { now: () => 5 } };
}

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user).values({ id: U1, householdId: H, email: 'u1@x.test', name: 'One' }).run();
	db.insert(schema.contact)
		.values(
			['markus', 'sandra', 'lea'].map((id) => ({
				id,
				householdId: H,
				createdBy: U1,
				visibility: 'shared' as const,
				displayName: id
			}))
		)
		.run();
});

const familyMoment = (body = 'Zoo') =>
	saveJournalEntry(deps(), author, {
		contactId: 'markus',
		furtherSubjectIds: ['sandra', 'lea'],
		entryDate: DAY,
		body
	});

const about = async (person: string) =>
	(await listJournalForContact(deps(), viewer, person)).map((e) => ({
		id: e.id,
		subjectIds: e.subjectIds
	}));

const photoOf = (id: string, entryId: string, contactId: string) =>
	db
		.insert(schema.photo)
		.values({
			id,
			householdId: H,
			contactId,
			journalEntryId: entryId,
			createdBy: U1,
			filePath: `${id}.jpg`,
			thumbPath: `${id}-t.jpg`,
			mime: 'image/jpeg'
		})
		.run();

const edit = (id: string, subjectIds: string[], body = 'Zoo') =>
	editJournalEntry(deps(), author, { id, body, mentionIds: [], subjectIds });

describe('a moment about several people', () => {
	it('is one entry, read in every subject’s journal with the anchor first', async () => {
		const id = await familyMoment();
		for (const person of ['markus', 'sandra', 'lea']) {
			expect(await about(person)).toEqual([{ id, subjectIds: ['markus', 'sandra', 'lea'] }]);
		}
		expect(db.select().from(schema.journalEntry).all()).toHaveLength(1);
	});

	it('shows its photos on every subject’s page', async () => {
		const id = await familyMoment();
		photoOf('p-1', id, 'markus');
		const photos = createDrizzleJournalPhotoReads(db);
		expect((await photos.listJournalPhotos(viewer, 'lea')).map((p) => p.id)).toEqual(['p-1']);
	});

	it('leaves the page of a person taken off it, and stays for the rest', async () => {
		const id = await familyMoment();
		expect(await edit(id, ['markus', 'lea'])).toBe(id);
		expect(await about('sandra')).toEqual([]);
		expect(await about('lea')).toEqual([{ id, subjectIds: ['markus', 'lea'] }]);
	});

	it('hands the anchor to the next person when the anchor goes, the photos with it', async () => {
		const id = await familyMoment();
		photoOf('p-1', id, 'markus');
		await edit(id, ['sandra', 'lea']);
		expect(await about('markus')).toEqual([]);
		const row = db.select().from(schema.journalEntry).where(eq(schema.journalEntry.id, id)).get();
		expect(row).toMatchObject({ contactId: 'sandra', subjectKey: 'lea,sandra' });
		expect(db.select().from(schema.photo).get()).toMatchObject({ contactId: 'sandra' });
	});

	it('joins the author’s entry about the same people that day, nothing dropped', async () => {
		const family = await familyMoment('Zoo');
		const solo = await saveJournalEntry(deps(), author, {
			contactId: 'markus',
			entryDate: DAY,
			body: 'Ice cream'
		});
		photoOf('p-solo', solo, 'markus');
		expect(await edit(solo, ['lea', 'markus', 'sandra'], 'Ice cream')).toBe(family);
		expect(db.select().from(schema.journalEntry).all()).toMatchObject([
			{ id: family, body: 'Zoo\n\nIce cream' }
		]);
		expect(db.select().from(schema.photo).get()).toMatchObject({ journalEntryId: family });
	});
});

describe('taking a person out of every moment (a merge, a deleted person)', () => {
	const run = (gone: string, by: string | null) =>
		db.transaction((tx) => replaceSubjectEverywhere(tx, gone, by, 9));

	it('re-anchors a moment about others too, and leaves one about them alone to go with them', async () => {
		const family = await familyMoment();
		const solo = await saveJournalEntry(deps(), author, {
			contactId: 'markus',
			entryDate: '2026-07-12',
			body: 'alone'
		});
		run('markus', null);
		expect(await about('sandra')).toEqual([{ id: family, subjectIds: ['sandra', 'lea'] }]);
		expect(
			db.select().from(schema.journalEntry).where(eq(schema.journalEntry.id, solo)).get()
		).toMatchObject({ contactId: 'markus' });
	});

	it('puts the survivor in their place, once, joining their entry about the same people', async () => {
		const family = await familyMoment('Zoo');
		const pair = await saveJournalEntry(deps(), author, {
			contactId: 'sandra',
			furtherSubjectIds: ['markus'],
			entryDate: DAY,
			body: 'Coffee'
		});
		// Lea merged into Sandra: the family moment is about Markus and Sandra now, like `pair`.
		run('lea', 'sandra');
		const rows = db.select().from(schema.journalEntry).all();
		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe(pair);
		expect(rows[0].body).toBe('Coffee\n\nZoo');
		expect(rows[0].subjectKey).toBe('markus,sandra');
		expect(family).not.toBe(pair);
	});
});
