import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import { logInteraction, type InteractionAuthor } from '../domain/interactions/interactions';
import { saveJournalEntry, type JournalAuthor } from '../domain/journal/journal';
import { listStoryPage, type StoryCursor } from '../domain/story/story';
import { createDrizzleInteractionRepository } from './interaction-repository';
import { createDrizzleJournalRepository } from './journal-repository';
import * as schema from './schema';

/*
 * Integration spec for the story read (docs/02 §2.23) over both adapters. `mergeStory` is
 * unit-tested on its own; what needs a database is the half in between — translating one story
 * cursor into two keyset cursors of different shapes, and keeping the merged page scoped to
 * what the viewer may see. Getting that wrong repeats or swallows entries, which is invisible
 * until someone scrolls back through a year of their own writing.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const journalAuthor: JournalAuthor = { userId: U1, householdId: H, defaultVisibility: 'shared' };
const interactionAuthor: InteractionAuthor = {
	userId: U1,
	householdId: H,
	defaultVisibility: 'shared'
};
const viewerU1: Viewer = { id: U1, householdId: H };
const viewerU2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;
let sequence = 0;

/** Distinct ids and a clock that ticks once per write, so ordering is exact, not raced. */
const nextId = () => `id-${++sequence}`;
const tick = () => ({ now: () => 1_000 + sequence });

function storyDeps() {
	return {
		journal: createDrizzleJournalRepository(db),
		interactions: createDrizzleInteractionRepository(db)
	};
}

function writeDeps() {
	return {
		journal: createDrizzleJournalRepository(db),
		interactions: createDrizzleInteractionRepository(db),
		ids: { next: nextId },
		clock: tick()
	};
}

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
		.values([{ id: 'oma', householdId: H, createdBy: U1, visibility: 'shared', displayName: 'Oma' }])
		.run();
	sequence = 0;
});

/** What the timeline shows, as `kind:day`, newest first. */
const shape = (page: { items: { kind: string; day: string }[] }) =>
	page.items.map((i) => `${i.kind}:${i.day}`);

describe('story read', () => {
	it('reads a journal entry and a touchpoint as one timeline, newest first', async () => {
		await saveJournalEntry(writeDeps(), journalAuthor, {
			contactId: 'oma',
			entryDate: '2026-08-01',
			body: 'Sang in the kitchen.'
		});
		await logInteraction(writeDeps(), interactionAuthor, {
			contactId: 'oma',
			kind: 'call',
			happenedAt: '2026-08-03'
		});
		await saveJournalEntry(writeDeps(), journalAuthor, {
			contactId: 'oma',
			entryDate: '2026-08-05',
			body: 'Showed us the old photos.'
		});

		const page = await listStoryPage(storyDeps(), viewerU1, 'oma', { limit: 10 });

		expect(shape(page)).toEqual(['journal:2026-08-05', 'interaction:2026-08-03', 'journal:2026-08-01']);
		expect(page.nextCursor).toBeNull();
	});

	it('walks the whole story in pages, showing every item exactly once', async () => {
		// Interleaved on purpose: every page boundary falls between the two sources.
		for (const day of ['2026-08-01', '2026-08-03', '2026-08-05']) {
			await saveJournalEntry(writeDeps(), journalAuthor, {
				contactId: 'oma',
				entryDate: day,
				body: `journal ${day}`
			});
		}
		for (const day of ['2026-08-02', '2026-08-04', '2026-08-06']) {
			await logInteraction(writeDeps(), interactionAuthor, {
				contactId: 'oma',
				kind: 'call',
				happenedAt: day
			});
		}

		const seen: string[] = [];
		let cursor: StoryCursor | undefined;
		for (let guard = 0; guard < 10; guard++) {
			const page = await listStoryPage(storyDeps(), viewerU1, 'oma', { limit: 2, cursor });
			seen.push(...shape(page));
			if (page.nextCursor === null) break;
			cursor = page.nextCursor;
		}

		expect(seen).toEqual([
			'interaction:2026-08-06',
			'journal:2026-08-05',
			'interaction:2026-08-04',
			'journal:2026-08-03',
			'interaction:2026-08-02',
			'journal:2026-08-01'
		]);
		expect(new Set(seen).size).toBe(seen.length);
	});

	it('keeps paging one source after the other has run out', async () => {
		// All the journal is newer than all the touchpoints, so the first page drains one side.
		for (const day of ['2026-08-05', '2026-08-06']) {
			await saveJournalEntry(writeDeps(), journalAuthor, {
				contactId: 'oma',
				entryDate: day,
				body: `journal ${day}`
			});
		}
		await logInteraction(writeDeps(), interactionAuthor, {
			contactId: 'oma',
			kind: 'met',
			happenedAt: '2026-01-01'
		});

		const first = await listStoryPage(storyDeps(), viewerU1, 'oma', { limit: 2 });
		expect(shape(first)).toEqual(['journal:2026-08-06', 'journal:2026-08-05']);
		expect(first.nextCursor).not.toBeNull();

		const second = await listStoryPage(storyDeps(), viewerU1, 'oma', {
			limit: 2,
			cursor: first.nextCursor!
		});
		expect(shape(second)).toEqual(['interaction:2026-01-01']);
		expect(second.nextCursor).toBeNull();
	});

	it('leaves another member out of what was written privately', async () => {
		await saveJournalEntry(writeDeps(), journalAuthor, {
			contactId: 'oma',
			entryDate: '2026-08-02',
			body: 'private note',
			visibility: 'private'
		});
		await logInteraction(writeDeps(), interactionAuthor, {
			contactId: 'oma',
			kind: 'gift',
			happenedAt: '2026-08-03',
			visibility: 'private'
		});
		await saveJournalEntry(writeDeps(), journalAuthor, {
			contactId: 'oma',
			entryDate: '2026-08-01',
			body: 'shared note'
		});

		// The author sees all three — the positive control, without which the next assertion
		// would pass just as happily against a read that returned nothing at all.
		const asAuthor = await listStoryPage(storyDeps(), viewerU1, 'oma', { limit: 10 });
		expect(shape(asAuthor)).toEqual([
			'interaction:2026-08-03',
			'journal:2026-08-02',
			'journal:2026-08-01'
		]);

		const asOther = await listStoryPage(storyDeps(), viewerU2, 'oma', { limit: 10 });
		expect(shape(asOther)).toEqual(['journal:2026-08-01']);
	});

	it('is empty and finished for a person nothing is recorded about', async () => {
		const page = await listStoryPage(storyDeps(), viewerU1, 'oma', { limit: 10 });

		expect(page.items).toEqual([]);
		expect(page.nextCursor).toBeNull();
	});
});
