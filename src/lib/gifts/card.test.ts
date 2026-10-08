import { describe, expect, it } from 'bun:test';
import { asksForGiftIdea, byYear, giftIdeaPath, giftTabs } from './card';

/*
 * How the person page's Gifts card stands (docs/02 §2.25, docs/05 §5.5): which tabs it shows,
 * what they count, and how a list of given or received gifts is divided by year.
 */

describe('giftTabs', () => {
	it('shows Ideas and Given, counting only the open ideas', () => {
		expect(giftTabs({ ideas: 3, given: 5, received: 0 })).toEqual([
			{ tab: 'ideas', count: 3 },
			{ tab: 'given', count: null }
		]);
	});

	it('leaves the count off when no idea is open', () => {
		expect(giftTabs({ ideas: 0, given: 1, received: 0 })[0]).toEqual({ tab: 'ideas', count: null });
	});

	it('shows Received only once there is one', () => {
		expect(giftTabs({ ideas: 0, given: 0, received: 1 }).map((t) => t.tab)).toEqual([
			'ideas',
			'given',
			'received'
		]);
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
