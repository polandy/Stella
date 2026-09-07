import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import * as schema from './schema';
import { createDrizzleMentionedInRepository } from './mentioned-in-repository';

/*
 * Integration spec for the Drizzle MentionedInRepository (docs/02 §2.20.1): the reverse lookup
 * from a person to the notes and journal entries elsewhere that name them, scoped through the
 * central `childRecordVisibleTo` so a passive item never shows a viewer something the entry
 * itself would have hidden.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewerU1: Viewer = { id: U1, householdId: H };
const viewerU2: Viewer = { id: U2, householdId: H };

/** A day in July 2026, as epoch milliseconds — 2026-07-12T09:00:00Z. */
const JULY_12 = Date.UTC(2026, 6, 12, 9);

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleMentionedInRepository>;

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user)
		.values([
			{ id: U1, householdId: H, email: 'u1@x.test', name: 'One' },
			{ id: U2, householdId: H, email: 'u2@x.test', name: 'Two' }
		])
		.run();
	db.insert(schema.contact)
		.values([
			{ id: 'c-beat', householdId: H, createdBy: U1, visibility: 'shared', displayName: 'Beat Steiner' },
			{ id: 'c-sandra', householdId: H, createdBy: U1, visibility: 'shared', displayName: 'Sandra Brunner' },
			{ id: 'c-secret', householdId: H, createdBy: U2, visibility: 'private', displayName: 'Someone Private' }
		])
		.run();
	repo = createDrizzleMentionedInRepository(db);
});

/** A note on `contactId` naming `mentions`, written by U1 unless said otherwise. */
function note(id: string, over: Partial<typeof schema.note.$inferInsert> = {}, mentions = 'c-sandra') {
	db.insert(schema.note)
		.values({
			id,
			contactId: 'c-beat',
			createdBy: U1,
			visibility: 'shared',
			body: 'hiked with @{contact:c-sandra}',
			createdAt: JULY_12,
			updatedAt: JULY_12,
			...over
		})
		.run();
	db.insert(schema.noteMention).values({ noteId: id, contactId: mentions }).run();
}

/** A journal entry on `contactId` naming `mentions`; each gets its own day (the slot is unique). */
function entry(
	id: string,
	over: Partial<typeof schema.journalEntry.$inferInsert> = {},
	mentions = 'c-sandra'
) {
	db.insert(schema.journalEntry)
		.values({
			id,
			contactId: 'c-beat',
			createdBy: U1,
			visibility: 'shared',
			entryDate: '2026-07-12',
			body: 'hiked with @{contact:c-sandra}',
			createdAt: JULY_12,
			updatedAt: JULY_12,
			...over
		})
		.run();
	db.insert(schema.journalMention).values({ journalEntryId: id, contactId: mentions }).run();
}

describe('createDrizzleMentionedInRepository', () => {
	it('finds the note that names a person, and says whose note it is', async () => {
		note('n-1', { title: 'Lake day' });

		expect(await repo.listNoteMentionsOfVisibleTo(viewerU1, 'c-sandra')).toEqual([
			{
				kind: 'note',
				entryId: 'n-1',
				sourceContactId: 'c-beat',
				sourceName: 'Beat Steiner',
				authorId: U1,
				visibility: 'shared',
				day: '2026-07-12',
				recordedAt: JULY_12,
				title: 'Lake day',
				body: 'hiked with @{contact:c-sandra}'
			}
		]);
	});

	it('dates a note by the day it was written, because a note is about no other day', async () => {
		note('n-1', { createdAt: Date.UTC(2026, 0, 31, 23), updatedAt: Date.UTC(2026, 0, 31, 23) });

		const [found] = await repo.listNoteMentionsOfVisibleTo(viewerU1, 'c-sandra');
		expect(found.day).toBe('2026-01-31');
	});

	it('finds the journal entry that names a person, dated by the day it is about', async () => {
		entry('j-1', { entryDate: '2026-06-01', createdAt: JULY_12, updatedAt: JULY_12 });

		expect(await repo.listJournalMentionsOfVisibleTo(viewerU1, 'c-sandra')).toEqual([
			{
				kind: 'journal',
				entryId: 'j-1',
				sourceContactId: 'c-beat',
				sourceName: 'Beat Steiner',
				authorId: U1,
				visibility: 'shared',
				day: '2026-06-01',
				recordedAt: JULY_12,
				title: null,
				body: 'hiked with @{contact:c-sandra}'
			}
		]);
	});

	it('names nobody when nothing mentions the person', async () => {
		note('n-1', {}, 'c-secret');

		expect(await repo.listNoteMentionsOfVisibleTo(viewerU1, 'c-sandra')).toEqual([]);
		expect(await repo.listJournalMentionsOfVisibleTo(viewerU1, 'c-sandra')).toEqual([]);
	});

	it('keeps a private note out of everyone else’s list', async () => {
		note('n-private', { visibility: 'private', createdBy: U2 });
		note('n-shared', { createdBy: U2 });

		// The positive control: U2's other note, read the same way, does reach U1.
		expect((await repo.listNoteMentionsOfVisibleTo(viewerU1, 'c-sandra')).map((m) => m.entryId)).toEqual([
			'n-shared'
		]);
		expect(
			(await repo.listNoteMentionsOfVisibleTo(viewerU2, 'c-sandra')).map((m) => m.entryId).sort()
		).toEqual(['n-private', 'n-shared']);
	});

	it('keeps a private journal entry out of everyone else’s list', async () => {
		entry('j-private', { visibility: 'private', createdBy: U2, entryDate: '2026-07-13' });
		entry('j-shared', { createdBy: U2 });

		expect(
			(await repo.listJournalMentionsOfVisibleTo(viewerU1, 'c-sandra')).map((m) => m.entryId)
		).toEqual(['j-shared']);
		expect(
			(await repo.listJournalMentionsOfVisibleTo(viewerU2, 'c-sandra')).map((m) => m.entryId).sort()
		).toEqual(['j-private', 'j-shared']);
	});

	it('does not let a reference give away a person the viewer may not see', async () => {
		note('n-hidden', { contactId: 'c-secret', createdBy: U2 });
		note('n-open', { createdBy: U2 });
		entry('j-hidden', { contactId: 'c-secret', createdBy: U2 });
		entry('j-open', { createdBy: U2 });

		// The private *contact* is U2's, so the same rows are a positive control for U2.
		expect((await repo.listNoteMentionsOfVisibleTo(viewerU1, 'c-sandra')).map((m) => m.entryId)).toEqual([
			'n-open'
		]);
		expect(
			(await repo.listJournalMentionsOfVisibleTo(viewerU1, 'c-sandra')).map((m) => m.entryId)
		).toEqual(['j-open']);
		expect(
			(await repo.listNoteMentionsOfVisibleTo(viewerU2, 'c-sandra')).map((m) => m.entryId).sort()
		).toEqual(['n-hidden', 'n-open']);
	});

	it('stops naming a person once the mention is taken out of the body', async () => {
		note('n-1');
		db.delete(schema.noteMention).run();

		expect(await repo.listNoteMentionsOfVisibleTo(viewerU1, 'c-sandra')).toEqual([]);
	});

	it('reads a renamed person under their current name', async () => {
		note('n-1');
		db.update(schema.contact)
			.set({ displayName: 'Beat Steiner-Brunner' })
			.where(eq(schema.contact.id, 'c-beat'))
			.run();

		expect((await repo.listNoteMentionsOfVisibleTo(viewerU1, 'c-sandra'))[0].sourceName).toBe(
			'Beat Steiner-Brunner'
		);
	});
});
