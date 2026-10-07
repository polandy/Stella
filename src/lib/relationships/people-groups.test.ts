import { describe, expect, it } from 'bun:test';
import {
	foldPeople,
	groupPeople,
	peopleGroupOf,
	SHOWN_WHEN_FOLDED,
	WORKED_OUT,
	workedOutShown
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
	const friends = [row('friend1', 'social', 'friend'), row('friend2', 'social', 'friend')];
	const groups = groupPeople([...family, ...friends, row('work', 'professional', 'colleague')]);

	it('shows the first few entered people and counts everybody it hides, worked out too', () => {
		const folded = foldPeople(groups, 3, false);
		expect(folded.groups.flatMap((g) => ids(g.rows))).toEqual(
			ids(family).slice(0, SHOWN_WHEN_FOLDED)
		);
		expect(folded.hidden).toBe(10 - SHOWN_WHEN_FOLDED + 3);
		// The heading still counts the whole group, and a group with nobody left shown is dropped.
		expect(folded.groups.map((g) => [g.group, g.total])).toEqual([['family', 7]]);
	});

	it('keeps the worked-out relatives entirely behind the fold', () => {
		expect(foldPeople(groups, 3, false).workedOutShown).toBe(0);
	});

	it('names every group it hides whole, with its count, the worked-out block last', () => {
		// Family is partly shown: its heading already counts it, so the line does not repeat it.
		expect(foldPeople(groups, 3, false).hiddenGroups).toEqual([
			{ group: 'social', count: 2 },
			{ group: 'professional', count: 1 },
			{ group: WORKED_OUT, count: 3 }
		]);
	});

	it('folds only the worked-out relatives when every entered person fits', () => {
		const few = groupPeople([...family.slice(0, 4), ...friends]);
		const folded = foldPeople(few, 4, false);
		expect(folded.groups.flatMap((g) => g.rows)).toHaveLength(6);
		expect(folded.workedOutShown).toBe(0);
		expect(folded.hidden).toBe(4);
		expect(folded.hiddenGroups).toEqual([{ group: WORKED_OUT, count: 4 }]);
	});

	it('shows everybody once unfolded', () => {
		const open = foldPeople(groups, 3, true);
		expect(open.hidden).toBe(0);
		expect(open.hiddenGroups).toEqual([]);
		expect(open.workedOutShown).toBe(3);
		expect(open.groups.flatMap((g) => g.rows)).toHaveLength(10);
	});

	it('never folds away a single person: a button costs as much room as they do', () => {
		const seven = groupPeople(family);
		expect(foldPeople(seven, 0, false).hidden).toBe(0);
		expect(foldPeople(seven, 0, false).groups[0].rows).toHaveLength(7);
		const six = groupPeople(family.slice(0, 6));
		expect(foldPeople(six, 1, false)).toMatchObject({ hidden: 0, workedOutShown: 1 });
	});

	it('counts the entered and the worked-out people together for that rule', () => {
		// One entered past six and one worked out: two hidden, so the card folds.
		const folded = foldPeople(groupPeople(family), 1, false);
		expect(folded.hidden).toBe(2);
		expect(folded.groups[0].rows).toHaveLength(SHOWN_WHEN_FOLDED);
		expect(folded.hiddenGroups).toEqual([{ group: WORKED_OUT, count: 1 }]);
	});
});

describe('workedOutShown', () => {
	it('shows no worked-out relative on a card that folds', () => {
		expect(workedOutShown(9, 3, false)).toBe(0);
		expect(workedOutShown(4, 2, false)).toBe(0);
	});

	it('shows them all on a card that does not fold, or once it is unfolded', () => {
		expect(workedOutShown(4, 1, false)).toBe(1);
		expect(workedOutShown(9, 3, true)).toBe(3);
	});
});
