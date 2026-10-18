import { describe, expect, it } from 'bun:test';
import { ALL_KINDS } from './browse';
import { circleFamilies, type CircleFamily } from './families';
import { circleTree, type TreeCircle } from './tree';

/*
 * The Circles list as families (docs/02 §2.4.2): one card per top-level circle with its direct
 * sub-circles as rows, the past ones behind a toggle, and search and the kind chips reaching
 * into every family.
 */

const TODAY = '2026-10-19';

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

const household = circleTree([
	node('School', null, { kind: 'school', hiddenChildCount: 1 }),
	node('Class 3a', 'School', { kind: 'class', startDate: '2022-08', endDate: '2023-07' }),
	// Current and future on TODAY; Class 3a is over.
	node('Class 5b', 'School', { kind: 'class', startDate: '2026-08', endDate: '2027-07' }),
	node('Class 6b', 'School', { kind: 'class', startDate: '2027-08', endDate: '2028-07' }),
	node('Choir 6b', 'Class 6b', { kind: 'club', description: 'Tuesdays at Bühl' }),
	node('Club', null, { kind: 'club' }),
	node('Juniors', 'Club', { kind: 'team', startDate: '2025-08' })
]);

const everything = { query: '', kind: ALL_KINDS, today: TODAY };

/** A family as `[top, shown rows, past rows]` by id, for readable expectations. */
const shape = (f: CircleFamily<TreeCircle>) => [
	f.circle.id,
	f.rows.map((r) => r.circle.id),
	f.pastRows.map((r) => r.circle.id)
];

describe('circleFamilies', () => {
	it('gives each top-level circle a card and its direct sub-circles rows, never cards', () => {
		const families = circleFamilies(household, everything);
		expect(families.map(shape)).toEqual([
			// Positive signal: Class 5b is a row inside School's card, not a card of its own.
			['Club', ['Juniors'], []],
			['School', ['Class 5b', 'Class 6b'], ['Class 3a']]
		]);
		expect(families.map((f) => f.circle.id)).not.toContain('Class 5b');
	});

	it('counts the sub-circles, the hidden ones included, and a row’s own sub-circles', () => {
		const school = circleFamilies(household, everything).find((f) => f.circle.id === 'School')!;
		expect(school.childCount).toBe(4);
		expect(school.hiddenCount).toBe(1);
		expect(school.rows.map((r) => [r.circle.id, r.descendantCount])).toEqual([
			['Class 5b', 0],
			['Class 6b', 1]
		]);
	});

	it('shows a family whose parent does not match with only the matching rows, past ones too', () => {
		const families = circleFamilies(household, { ...everything, query: 'class 3' });
		expect(families.map(shape)).toEqual([['School', ['Class 3a'], []]]);
		expect(families[0].hiddenCount).toBe(0);
	});

	it('finds a sub-circle at any depth, by the description too and without accents', () => {
		const families = circleFamilies(household, { ...everything, query: 'buhl' });
		expect(families.map(shape)).toEqual([['School', ['Choir 6b'], []]]);
	});

	it('keeps the whole family when the parent itself matches', () => {
		const families = circleFamilies(household, { ...everything, query: 'school' });
		expect(families.map(shape)).toEqual([['School', ['Class 5b', 'Class 6b'], ['Class 3a']]]);
	});

	it('keeps a card whose kind does not match when a sub-circle’s does', () => {
		expect(circleFamilies(household, { ...everything, kind: 'class' }).map(shape)).toEqual([
			['School', ['Class 5b', 'Class 6b'], ['Class 3a']]
		]);
		// Choir 6b is a club two levels down: School stays, next to the club itself.
		expect(
			circleFamilies(household, { ...everything, kind: 'club' }).map((f) => f.circle.id)
		).toEqual(['Club', 'School']);
	});

	it('leaves out a family nothing in matches', () => {
		expect(circleFamilies(household, { ...everything, query: 'nowhere' })).toEqual([]);
	});
});
