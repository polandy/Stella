import { describe, expect, it } from 'bun:test';
import {
	circleTree,
	compareChronological,
	compareNewestFirst,
	isPastCircle,
	type TreeCircle
} from './tree';

/*
 * The nesting of circles as every screen reads it (docs/02 §2.4.2): who is whose child, in
 * which order, how far down a family goes, and which circles are over — without ever looping on
 * bad data.
 */

const TODAY = '2026-10-19';

/** A visible circle under `parentId`, with nothing else said about it. */
function node(id: string, parentId: string | null, fields: Partial<TreeCircle> = {}): TreeCircle {
	return {
		id,
		parentId,
		name: id,
		description: null,
		kind: 'other',
		color: 'blue',
		startDate: null,
		endDate: null,
		visibility: 'shared',
		memberCount: 0,
		hiddenChildCount: 0,
		...fields
	};
}

const ids = (circles: readonly TreeCircle[]) => circles.map((c) => c.id);

/** A school with three years of classes, one with a reading group in it, and a club beside it. */
const SCHOOL = [
	node('club', null),
	node('school', null),
	node('5b', 'school', { name: 'Class 5b', startDate: '2025-08', endDate: '2026-07' }),
	node('4b', 'school', { name: 'Class 4b', startDate: '2024-08', endDate: '2025-07' }),
	node('choir', 'school', { name: 'Choir' }),
	node('6b', 'school', { name: 'Class 6b', startDate: '2026-08' }),
	node('reading', '5b', { name: 'Reading group' }),
	node('pairs', 'reading', { name: 'Reading pairs' })
];

describe('the order sub-circles are listed in', () => {
	it('puts the newest period first and the undated ones last', () => {
		const tree = circleTree(SCHOOL);
		expect(ids(tree.children('school'))).toEqual(['6b', '5b', '4b', 'choir']);
	});

	it('runs a family of school years newest first, as the list and the timeline show it', () => {
		const years = [
			node('school', null, { name: 'Leonardo Schule' }),
			node('k23', 'school', {
				name: 'Kindergarten Munzi II 23/24',
				startDate: '2023-08-01',
				endDate: '2024-07-31'
			}),
			node('k24', 'school', {
				name: 'Kindergarten Munzi II 24/25',
				startDate: '2024-08',
				endDate: '2025-07'
			}),
			node('c25', 'school', {
				name: 'Klasse 1-2D 25/26',
				startDate: '2025-08',
				endDate: '2026-07'
			}),
			node('c26', 'school', { name: 'Klasse 1-2D 26/27', startDate: '2026-08', endDate: '2027-07' })
		];
		expect(ids(circleTree(years).children('school'))).toEqual(['c26', 'c25', 'k24', 'k23']);
	});

	it('breaks a tie on the start by the later end, then by name, and reads a year alone as its January', () => {
		const short = node('s', null, { name: 'Short', startDate: '2024-08', endDate: '2024-12' });
		const long = node('l', null, { name: 'Long', startDate: '2024-08', endDate: '2025-07' });
		const beta = node('b', null, { name: 'Beta', startDate: '2024-08', endDate: '2025-07' });
		const year = node('y', null, { name: 'Year', startDate: '2024' });
		const undatedB = node('ub', null, { name: 'Zoo' });
		const undatedA = node('ua', null, { name: 'Ants' });
		expect(
			[undatedB, year, short, beta, undatedA, long].sort(compareNewestFirst).map((c) => c.name)
		).toEqual(['Beta', 'Long', 'Short', 'Year', 'Ants', 'Zoo']);
	});

	it('puts a period without an end before one that has ended, on the same start', () => {
		const open = node('o', null, { name: 'Open', startDate: '2024-08' });
		const closed = node('c', null, { name: 'Closed', startDate: '2024-08', endDate: '2025-07' });
		expect([closed, open].sort(compareNewestFirst).map((c) => c.name)).toEqual(['Open', 'Closed']);
	});
});

describe('the chronological order the sibling steps follow', () => {
	it('runs by period start, undated last, then by name', () => {
		const a = node('a', null, { name: 'Beta', startDate: '2024-08' });
		const b = node('b', null, { name: 'Alpha', startDate: '2024-08' });
		const later = node('l', null, { name: 'Later', startDate: '2025-08' });
		const year = node('y', null, { name: 'Zeta', startDate: '2024' });
		const undated = node('u', null, { name: 'Aardvark' });
		expect([undated, later, a, b, year].sort(compareChronological).map((c) => c.name)).toEqual([
			'Zeta',
			'Alpha',
			'Beta',
			'Later',
			'Aardvark'
		]);
	});

	it('keeps top-level circles in it', () => {
		const tops = [
			node('new', null, { startDate: '2025' }),
			node('old', null, { startDate: '2020' })
		];
		expect(ids(circleTree(tops).topLevel())).toEqual(['old', 'new']);
	});
});

describe('the levels', () => {
	it('puts only circles without a parent on top', () => {
		expect(ids(circleTree(SCHOOL).topLevel())).toEqual(['club', 'school']);
	});

	it('reaches every depth below a circle, and every ancestor above it from the top', () => {
		const tree = circleTree(SCHOOL);
		expect(ids(tree.descendants('school')).sort()).toEqual(
			['4b', '5b', '6b', 'choir', 'pairs', 'reading'].sort()
		);
		expect(ids(tree.descendants('5b'))).toEqual(['reading', 'pairs']);
		// Each family newest first, depth first: a year's own circles follow it.
		expect(ids(tree.descendants('school'))).toEqual([
			'6b',
			'5b',
			'reading',
			'pairs',
			'4b',
			'choir'
		]);
		expect(ids(tree.ancestors('pairs'))).toEqual(['school', '5b', 'reading']);
		expect(tree.ancestors('school')).toEqual([]);
	});

	it('steps to the earlier sibling as previous and the later one as next, none past either end', () => {
		const tree = circleTree(SCHOOL);
		expect(tree.neighbours('5b')).toMatchObject({ previous: { id: '4b' }, next: { id: '6b' } });
		expect(tree.neighbours('4b')).toMatchObject({ previous: null, next: { id: '5b' } });
		expect(tree.neighbours('choir')).toMatchObject({ previous: { id: '6b' }, next: null });
		// A top-level circle is nobody's sibling here: the list is its neighbourhood.
		expect(tree.neighbours('school')).toEqual({ previous: null, next: null });
		// An only child has no siblings to step to.
		expect(tree.neighbours('reading')).toEqual({ previous: null, next: null });
	});
});

describe('a cycle in the data', () => {
	it('is cut at one circle, so every circle is still reachable and every walk ends', () => {
		const loop = [node('a', 'c'), node('b', 'a'), node('c', 'b'), node('d', 'c')];
		const tree = circleTree(loop);
		// The smallest id in the loop stands on top; the rest hang below it as stored.
		expect(ids(tree.topLevel())).toEqual(['a']);
		expect(ids(tree.descendants('a'))).toEqual(['b', 'c', 'd']);
		expect(ids(tree.ancestors('d'))).toEqual(['a', 'b', 'c']);
	});

	it('cuts a circle that is its own parent', () => {
		const tree = circleTree([node('self', 'self')]);
		expect(ids(tree.topLevel())).toEqual(['self']);
		expect(tree.children('self')).toEqual([]);
	});
});

describe('a hidden private child', () => {
	it('is counted beside its visible siblings without being one', () => {
		const tree = circleTree([node('club', null, { hiddenChildCount: 1 }), node('team', 'club')]);
		expect(ids(tree.children('club'))).toEqual(['team']);
		expect(tree.childCount('club')).toBe(2);
		expect(tree.childCount('team')).toBe(0);
	});

	it('leaves its parent with nothing listed but still a family', () => {
		const tree = circleTree([node('club', null, { hiddenChildCount: 2 })]);
		expect(tree.children('club')).toEqual([]);
		expect(tree.childCount('club')).toBe(2);
	});
});

describe('isPastCircle', () => {
	it('is over only once the last day of its end has gone by', () => {
		expect(isPastCircle({ endDate: '2026-10-18' }, TODAY)).toBe(true);
		expect(isPastCircle({ endDate: '2026-10-19' }, TODAY)).toBe(false);
		// A month runs to its end, a year to December.
		expect(isPastCircle({ endDate: '2026-09' }, TODAY)).toBe(true);
		expect(isPastCircle({ endDate: '2026-10' }, TODAY)).toBe(false);
		expect(isPastCircle({ endDate: '2025' }, TODAY)).toBe(true);
		expect(isPastCircle({ endDate: '2026' }, TODAY)).toBe(false);
	});

	it('never ends a circle without an end', () => {
		expect(isPastCircle({ endDate: null }, TODAY)).toBe(false);
	});
});
