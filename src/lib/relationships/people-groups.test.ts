import { describe, expect, it } from 'bun:test';
import {
	derivedShownWhenFolded,
	foldPeople,
	groupPeople,
	peopleGroupOf,
	SHOWN_WHEN_FOLDED
} from './people-groups';
import type { RoleTerm } from './roles';

/*
 * The People card's list (docs/05 §5.5): the ties grouped by the kind the household gave them,
 * family first, and folded to a handful once there are enough of them to push the photos away.
 */

interface Row {
	id: string;
	category: string;
	role: RoleTerm | null;
	status?: string;
}
const row = (id: string, category: string, role: RoleTerm | null, status = 'current'): Row => ({
	id,
	category,
	role,
	status
});
const ids = (rows: readonly Row[]) => rows.map((r) => r.id);

describe('peopleGroupOf', () => {
	it('counts a partner as family: the card has no group of one for them', () => {
		expect(peopleGroupOf('romantic')).toBe('family');
		expect(peopleGroupOf('family')).toBe('family');
	});

	it('keeps friends, work and the rest apart, and files an unknown kind under the rest', () => {
		expect(peopleGroupOf('social')).toBe('social');
		expect(peopleGroupOf('professional')).toBe('professional');
		expect(peopleGroupOf('other')).toBe('other');
		expect(peopleGroupOf('made-up')).toBe('other');
	});
});

describe('groupPeople', () => {
	it('lists family, friends, work and the rest in that order, leaving out a group nobody is in', () => {
		const groups = groupPeople([
			row('colleague', 'professional', 'colleague'),
			row('friend', 'social', 'friend'),
			row('daughter', 'family', 'child')
		]);
		expect(groups.map((g) => g.group)).toEqual(['family', 'social', 'professional']);
		expect(groups.map((g) => g.total)).toEqual([1, 1, 1]);
	});

	it('puts the partner first, then parents, children and siblings, the wider family after', () => {
		const groups = groupPeople([
			row('cousin', 'family', 'cousin'),
			row('son', 'family', 'child'),
			row('brother', 'family', 'sibling'),
			row('wife', 'romantic', 'spouse'),
			row('godchild', 'family', null),
			row('father', 'family', 'parent'),
			row('daughter', 'family', 'child')
		]);
		expect(ids(groups[0].rows)).toEqual([
			'wife',
			'father',
			'son',
			'daughter',
			'brother',
			'cousin',
			'godchild'
		]);
	});

	it('lists a former tie after the current ones of its group', () => {
		const groups = groupPeople([
			row('ex', 'romantic', 'spouse', 'former'),
			row('daughter', 'family', 'child')
		]);
		expect(ids(groups[0].rows)).toEqual(['daughter', 'ex']);
	});
});

describe('foldPeople', () => {
	const family = Array.from({ length: 7 }, (_, i) => row(`f${i}`, 'family', 'child'));
	const groups = groupPeople([
		...family,
		row('friend', 'social', 'friend'),
		row('work', 'professional', 'colleague')
	]);

	it('shows the first few and says how many more there are', () => {
		const folded = foldPeople(groups, false);
		expect(folded.hidden).toBe(9 - SHOWN_WHEN_FOLDED);
		expect(folded.groups.flatMap((g) => ids(g.rows))).toEqual(
			ids(family).slice(0, SHOWN_WHEN_FOLDED)
		);
		// The heading still counts the whole group, and a group with nobody left shown is dropped.
		expect(folded.groups.map((g) => [g.group, g.total])).toEqual([['family', 7]]);
	});

	it('shows everybody once unfolded', () => {
		const open = foldPeople(groups, true);
		expect(open.hidden).toBe(0);
		expect(open.groups.flatMap((g) => g.rows)).toHaveLength(9);
	});

	it('never folds away a single person: a button costs as much room as they do', () => {
		const seven = groupPeople(family);
		expect(foldPeople(seven, false).hidden).toBe(0);
		expect(foldPeople(seven, false).groups[0].rows).toHaveLength(7);
		const eight = groupPeople([...family, row('f7', 'family', 'child')]);
		expect(foldPeople(eight, false).hidden).toBe(2);
	});
});

describe('derivedShownWhenFolded', () => {
	it('keeps a short list of worked-out relatives whole', () => {
		expect(derivedShownWhenFolded(3, false)).toBe(3);
		expect(derivedShownWhenFolded(0, false)).toBe(0);
	});

	it('folds a longer one to a single row of two', () => {
		expect(derivedShownWhenFolded(7, false)).toBe(2);
	});

	it('shows them all once unfolded', () => {
		expect(derivedShownWhenFolded(7, true)).toBe(7);
	});
});
