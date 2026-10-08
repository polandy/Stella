import { describe, expect, it } from 'bun:test';
import {
	mergeStory,
	type StoryCursor,
	type StoryPage,
	type StoryPoint,
	type StoryResume,
	type StorySource
} from './story';
import type { JournalEntry } from '../journal/journal';
import type { Interaction } from '../interactions/interactions';
import type { DatedGift } from '../gifts/gifts';

/*
 * The story timeline (docs/02 §2.23): one chronological read over two sources that are
 * paginated separately. The merge is pure, so every ordering and cursor rule is checked here
 * rather than through a route.
 */

function entry(day: string, recordedAt: number, id = `j-${day}-${recordedAt}`): JournalEntry {
	return {
		id,
		contactId: 'c1',
		createdBy: 'u1',
		visibility: 'shared',
		entryDate: day,
		title: null,
		body: 'body',
		createdAt: recordedAt,
		updatedAt: recordedAt
	};
}

function touchpoint(day: string, recordedAt: number, id = `i-${day}-${recordedAt}`): Interaction {
	return {
		id,
		contactId: 'c1',
		createdBy: 'u1',
		visibility: 'shared',
		kind: 'call',
		happenedAt: day,
		title: null,
		description: null,
		participants: [],
		createdAt: recordedAt,
		updatedAt: recordedAt
	};
}

function present(
	day: string,
	recordedAt: number,
	state: 'given' | 'received' = 'given',
	id = `g-${day}-${recordedAt}`
): DatedGift {
	return {
		id,
		contactId: 'c1',
		createdBy: 'u1',
		visibility: 'shared',
		state,
		title: 'Teapot',
		note: null,
		url: null,
		givenOn: day,
		occasion: null,
		createdAt: recordedAt,
		updatedAt: recordedAt
	};
}

/** A source that handed back everything it had. */
function whole<T>(items: T[]): StorySource<T> {
	return { items, exhausted: true, resumeFrom: 'top' };
}

/** A source that filled its page, so more rows are waiting behind it. */
function partial<T>(items: T[], resumeFrom: StoryResume = 'top'): StorySource<T> {
	return { items, exhausted: false, resumeFrom };
}

/** No gifts at all: most of the cases below are about the other two sources. */
const NO_GIFTS = whole<DatedGift>([]);
const NO_GIFTS_TOUCHPOINTS = whole<Interaction>([]);

const ids = (page: StoryPage): string[] =>
	page.items.map((item) =>
		item.kind === 'journal'
			? item.entry.id
			: item.kind === 'interaction'
				? item.interaction.id
				: item.gift.id
	);

describe('mergeStory ordering', () => {
	it('interleaves both sources newest day first', () => {
		const page = mergeStory({
			journal: whole([entry('2026-03-10', 10), entry('2026-03-01', 1)]),
			interactions: whole([touchpoint('2026-03-05', 5)]),
			gifts: NO_GIFTS,
			limit: 10
		});

		expect(ids(page)).toEqual(['j-2026-03-10-10', 'i-2026-03-05-5', 'j-2026-03-01-1']);
	});

	it('puts the later recording first when two things happened on the same day', () => {
		const page = mergeStory({
			journal: whole([entry('2026-03-10', 100)]),
			interactions: whole([touchpoint('2026-03-10', 200)]),
			gifts: NO_GIFTS,
			limit: 10
		});

		expect(ids(page)).toEqual(['i-2026-03-10-200', 'j-2026-03-10-100']);
	});

	it('orders a dead heat the same way every time, so paging cannot repeat an item', () => {
		const args = {
			journal: whole([entry('2026-03-10', 100)]),
			interactions: whole([touchpoint('2026-03-10', 100)]),
			gifts: NO_GIFTS,
			limit: 10
		};

		expect(ids(mergeStory(args))).toEqual(ids(mergeStory(args)));
		expect(ids(mergeStory(args))).toEqual(['i-2026-03-10-100', 'j-2026-03-10-100']);
	});

	it('carries each item through with the kind the timeline renders it as', () => {
		const page = mergeStory({
			journal: whole([entry('2026-03-10', 10)]),
			interactions: whole([touchpoint('2026-03-09', 9)]),
			gifts: NO_GIFTS,
			limit: 10
		});

		expect(page.items.map((i) => i.kind)).toEqual(['journal', 'interaction']);
		expect(page.items[0]).toMatchObject({ day: '2026-03-10', recordedAt: 10 });
		expect(page.items[1]).toMatchObject({ day: '2026-03-09', recordedAt: 9 });
	});

	it('reads a given or received gift on its day, beside entries and touchpoints', () => {
		const page = mergeStory({
			journal: whole([entry('2026-03-10', 10)]),
			interactions: whole([touchpoint('2026-03-05', 5)]),
			gifts: whole([present('2026-03-08', 8), present('2026-03-01', 1, 'received')]),
			limit: 10
		});

		expect(ids(page)).toEqual([
			'j-2026-03-10-10',
			'g-2026-03-08-8',
			'i-2026-03-05-5',
			'g-2026-03-01-1'
		]);
		expect(page.items[1]).toMatchObject({ kind: 'gift', day: '2026-03-08', recordedAt: 8 });
	});

	it('is empty, and finished, for a person nothing is recorded about', () => {
		const page = mergeStory({
			journal: whole([]),
			interactions: whole([]),
			gifts: NO_GIFTS,
			limit: 10
		});

		expect(page.items).toEqual([]);
		expect(page.nextCursor).toBeNull();
	});
});

describe('mergeStory paging', () => {
	it('stops at the limit and resumes each source after its last shown item', () => {
		const page = mergeStory({
			journal: partial([entry('2026-03-10', 10), entry('2026-03-08', 8)]),
			interactions: partial([touchpoint('2026-03-09', 9), touchpoint('2026-03-07', 7)]),
			gifts: NO_GIFTS,
			limit: 2
		});

		expect(ids(page)).toEqual(['j-2026-03-10-10', 'i-2026-03-09-9']);
		expect(page.nextCursor).toEqual({
			journal: { day: '2026-03-10', recordedAt: 10 },
			interactions: { day: '2026-03-09', recordedAt: 9 },
			gifts: 'finished'
		});
	});

	it('leaves a source it did not reach at the point it was read from', () => {
		const readFrom = { day: '2026-04-01', recordedAt: 400 };
		const page = mergeStory({
			journal: partial([entry('2026-03-10', 10), entry('2026-03-09', 9)]),
			interactions: partial([touchpoint('2026-01-01', 1)], readFrom),
			gifts: NO_GIFTS,
			limit: 2
		});

		expect(ids(page)).toEqual(['j-2026-03-10-10', 'j-2026-03-09-9']);
		// Nothing from the interactions was shown, so the next page must read them again from
		// exactly where this one did — not from the top, which would repeat what came before.
		expect(page.nextCursor?.interactions).toEqual(readFrom);
	});

	it('finishes a source that handed back everything it had and was fully shown', () => {
		const page = mergeStory({
			journal: whole([entry('2026-03-10', 10)]),
			interactions: whole([touchpoint('2026-03-09', 9)]),
			gifts: NO_GIFTS,
			limit: 10
		});

		expect(page.nextCursor).toBeNull();
	});

	it('keeps reading a source that ran out but still has items below the fold', () => {
		const page = mergeStory({
			journal: whole([entry('2026-03-10', 10), entry('2026-03-08', 8)]),
			interactions: whole([touchpoint('2026-03-09', 9)]),
			gifts: NO_GIFTS,
			limit: 2
		});

		expect(ids(page)).toEqual(['j-2026-03-10-10', 'i-2026-03-09-9']);
		expect(page.nextCursor).toEqual({
			journal: { day: '2026-03-10', recordedAt: 10 },
			interactions: 'finished',
			gifts: 'finished'
		});
	});

	it('resumes the gifts after the last one shown, like the other two sources', () => {
		const page = mergeStory({
			journal: whole([entry('2026-03-10', 10)]),
			interactions: NO_GIFTS_TOUCHPOINTS,
			gifts: partial([present('2026-03-09', 9), present('2026-03-01', 1)]),
			limit: 2
		});

		expect(ids(page)).toEqual(['j-2026-03-10-10', 'g-2026-03-09-9']);
		expect(page.nextCursor).toEqual({
			journal: 'finished',
			interactions: 'finished',
			gifts: { day: '2026-03-09', recordedAt: 9 }
		});
	});

	it('walks the whole story without repeating or dropping anything', () => {
		// Three interleaved sources, read two at a time the way the page reads them.
		const allJournal = ['2026-03-09', '2026-03-07', '2026-03-05'].map((d, i) => entry(d, 100 - i));
		const allInteractions = ['2026-03-10', '2026-03-08', '2026-03-06'].map((d, i) =>
			touchpoint(d, 200 - i)
		);
		const allGifts = ['2026-03-09', '2026-03-04'].map((d, i) => present(d, 150 - i));

		/** Stands in for a keyset repository: rows strictly older than the cursor, newest first. */
		function read<T>(
			rows: T[],
			pointOf: (row: T) => StoryPoint,
			from: StoryResume,
			pageSize: number
		): StorySource<T> {
			if (from === 'finished') return { items: [], exhausted: true, resumeFrom: 'finished' };
			const older = rows.filter((row) => {
				if (from === 'top') return true;
				const p = pointOf(row);
				return p.day < from.day || (p.day === from.day && p.recordedAt < from.recordedAt);
			});
			return {
				items: older.slice(0, pageSize),
				exhausted: older.length <= pageSize,
				resumeFrom: from
			};
		}

		const seen: string[] = [];
		let cursor: StoryCursor | null = null;

		for (let guard = 0; guard < 10; guard++) {
			const page: StoryPage = mergeStory({
				journal: read(
					allJournal,
					(e) => ({ day: e.entryDate, recordedAt: e.createdAt }),
					cursor?.journal ?? 'top',
					2
				),
				interactions: read(
					allInteractions,
					(t) => ({ day: t.happenedAt, recordedAt: t.createdAt }),
					cursor?.interactions ?? 'top',
					2
				),
				gifts: read(
					allGifts,
					(g) => ({ day: g.givenOn, recordedAt: g.createdAt }),
					cursor?.gifts ?? 'top',
					2
				),
				limit: 2
			});

			seen.push(...ids(page));
			if (page.nextCursor === null) break;
			cursor = page.nextCursor;
		}

		expect(seen).toEqual([
			'i-2026-03-10-200',
			'g-2026-03-09-150',
			'j-2026-03-09-100',
			'i-2026-03-08-199',
			'j-2026-03-07-99',
			'i-2026-03-06-198',
			'j-2026-03-05-98',
			'g-2026-03-04-149'
		]);
		expect(new Set(seen).size).toBe(seen.length);
	});
});
