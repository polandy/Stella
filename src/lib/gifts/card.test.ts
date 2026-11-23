import { describe, expect, it } from 'bun:test';
import type { When } from '../when/when';
import { asksForGiftIdea, byYear, giftIdeaPath, giftTabs, splitGives, splitIdeas } from './card';

/*
 * How the person page's Gifts card stands (docs/dev/02 §2.25, docs/dev/05 §5.5): which tabs it shows,
 * what they count, and how a list of given or received gifts is divided by year.
 */

describe('giftTabs', () => {
	const counts = { ideas: 0, given: 0, received: 0, gives: 0 };

	it('shows Ideas, Given and Gives, counting only the open ideas and what is still to give', () => {
		expect(giftTabs({ ...counts, ideas: 3, given: 5, gives: 2 })).toEqual([
			{ tab: 'ideas', count: 3 },
			{ tab: 'given', count: null },
			{ tab: 'gives', count: 2 }
		]);
	});

	it('leaves the count off when nothing is open', () => {
		expect(giftTabs({ ...counts, given: 1 })).toEqual([
			{ tab: 'ideas', count: null },
			{ tab: 'given', count: null },
			{ tab: 'gives', count: null }
		]);
	});

	it('shows Received only once there is one, before Gives', () => {
		expect(giftTabs({ ...counts, received: 1 }).map((t) => t.tab)).toEqual([
			'ideas',
			'given',
			'received',
			'gives'
		]);
	});
});

describe('splitGives', () => {
	it('puts what is still to give first and what was given under Earlier', () => {
		const rows = [
			{ id: 'a', state: 'idea' },
			{ id: 'b', state: 'given' },
			{ id: 'c', state: 'bought' }
		] as const;
		const { open, earlier } = splitGives(rows);
		expect(open.map((g) => g.id)).toEqual(['a', 'c']);
		expect(earlier.map((g) => g.id)).toEqual(['b']);
	});
});

describe('byYear', () => {
	const gift = (id: string, givenOn: string) => ({ id, givenOn });

	it('divides gifts by the year they were given, in the order they arrive', () => {
		const groups = byYear([
			gift('a', '2025-12-24'),
			gift('b', '2025-10-18'),
			gift('c', '2023-10-12')
		]);
		expect(groups.map((g) => g.year)).toEqual(['2025', '2023']);
		expect(groups[0]!.gifts.map((g) => g.id)).toEqual(['a', 'b']);
		expect(groups[1]!.gifts.map((g) => g.id)).toEqual(['c']);
	});

	it('has no year for nothing', () => {
		expect(byYear([])).toEqual([]);
	});
});

describe('giftIdeaPath', () => {
	it('lands on the Gifts card with the idea form asked for, and reads back as asking', () => {
		const path = giftIdeaPath('c1');
		expect(path).toBe('/contacts/c1?gift=idea');
		expect(asksForGiftIdea(new URL(path, 'https://stella.test'))).toBe(true);
	});

	it('is not asked for by a plain link to the person', () => {
		expect(asksForGiftIdea(new URL('https://stella.test/contacts/c1#section-gifts'))).toBe(false);
	});
});

describe('splitIdeas', () => {
	const birth = { value: '2018-03-14', precision: 'full' as const };
	const today = '2026-10-08';
	const idea = (id: string, when: When | null) => ({
		id,
		when,
		whenCheckedOn: null,
		createdAt: Date.parse('2026-10-08T12:00:00Z')
	});

	it('keeps what holds now open, and folds the waiting ones away, soonest first', () => {
		const { open, waiting } = splitIdeas(
			[
				idea('later', { kind: 'later' }),
				idea('now', null),
				idea('tenth', { kind: 'at_age', age: 10 }),
				idea('christmas', { kind: 'on_date', on: '2026-12-24' }),
				idea('ninth', { kind: 'at_age', age: 9 })
			],
			birth,
			today
		);
		expect(open.map((i) => i.id)).toEqual(['now', 'christmas']);
		expect(waiting.map((i) => i.id)).toEqual(['ninth', 'tenth', 'later']);
	});

	it('opens an idea within its lead time, gone by, or at the yearly look of later', () => {
		const { open, waiting } = splitIdeas(
			[
				idea('ninth', { kind: 'at_age', age: 9 }),
				idea('summer', { kind: 'on_date', on: '2026-12-01' }),
				{ ...idea('long ago', { kind: 'later' }), createdAt: Date.parse('2025-11-01T12:00:00Z') },
				{
					...idea('answered', { kind: 'later' }),
					createdAt: Date.parse('2025-11-01T12:00:00Z'),
					whenCheckedOn: '2026-12-15'
				}
			],
			birth,
			'2026-12-20'
		);
		expect(open.map((i) => i.id)).toEqual(['ninth', 'summer', 'long ago']);
		expect(waiting.map((i) => i.id)).toEqual(['answered']);
	});

	it('leaves an age open when the birth year went missing', () => {
		const { open, waiting } = splitIdeas([idea('tenth', { kind: 'at_age', age: 10 })], null, today);
		expect(open).toHaveLength(1);
		expect(waiting).toHaveLength(0);
	});
});
