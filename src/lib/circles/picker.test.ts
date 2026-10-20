import { describe, expect, it } from 'bun:test';
import { pickerRows, searchPickerRows, subCircleKindFor, type PickerRow } from './picker';
import { circleTree, type TreeCircle } from './tree';

/*
 * The circle picker (docs/02 §2.4.2): every circle the reader sees, as a tree, with the ones that
 * cannot be chosen still there and saying why. Choosing a parent and adding an existing circle
 * rule out different circles; neither lets a circle land inside itself.
 */

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

// school ⊃ class ⊃ group; club stands for itself; team sits in club.
const tree = circleTree([
	node('school', null, { startDate: '2020' }),
	node('class', 'school'),
	node('group', 'class'),
	node('club', null, { startDate: '2021' }),
	node('team', 'club')
]);

/** Each row as `id:depth`, its block and the check, which is what a test asks of it. */
const brief = (rows: PickerRow[]) =>
	rows.map((r) => ({ id: r.id, depth: r.depth, block: r.block, checked: r.checked }));

describe('pickerRows for a parent', () => {
	it('lists the tree depth first, disabling the circle itself and everything inside it', () => {
		const rows = pickerRows(tree, { mode: 'parent', subjectId: 'class', selectedId: 'school' });
		expect(brief(rows)).toEqual([
			{ id: 'school', depth: 0, block: null, checked: true },
			{ id: 'class', depth: 1, block: { reason: 'self' }, checked: false },
			{ id: 'group', depth: 2, block: { reason: 'inside', name: 'class' }, checked: false },
			{ id: 'club', depth: 0, block: null, checked: false },
			{ id: 'team', depth: 1, block: null, checked: false }
		]);
	});

	it('disables nothing for a circle not made yet', () => {
		const rows = pickerRows(tree, { mode: 'parent', subjectId: null, selectedId: null });
		expect(rows.every((r) => r.block === null && !r.checked)).toBe(true);
		expect(rows.every((r) => r.movesFrom === null)).toBe(true);
	});

	it('gives each row the way down to it', () => {
		const rows = pickerRows(tree, { mode: 'parent', subjectId: null, selectedId: null });
		expect(rows.find((r) => r.id === 'group')?.path).toEqual(['school', 'class']);
		expect(rows.find((r) => r.id === 'school')?.path).toEqual([]);
	});
});

describe('pickerRows for adding an existing circle', () => {
	it('disables the circle itself, what contains it and what is in it already', () => {
		const rows = pickerRows(tree, { mode: 'add', subjectId: 'class', selectedId: null });
		expect(brief(rows)).toEqual([
			{ id: 'school', depth: 0, block: { reason: 'contains', name: 'class' }, checked: false },
			{ id: 'class', depth: 1, block: { reason: 'self' }, checked: false },
			{ id: 'group', depth: 2, block: { reason: 'alreadyIn' }, checked: true },
			{ id: 'club', depth: 0, block: null, checked: false },
			{ id: 'team', depth: 1, block: null, checked: false }
		]);
	});

	it('says where a circle sits now, as it is moved from there', () => {
		const rows = pickerRows(tree, { mode: 'add', subjectId: 'class', selectedId: null });
		expect(rows.find((r) => r.id === 'team')?.movesFrom).toBe('club');
		expect(rows.find((r) => r.id === 'club')?.movesFrom).toBeNull();
		// Already inside: nothing moves.
		expect(rows.find((r) => r.id === 'group')?.movesFrom).toBeNull();
	});

	it('lets a circle deeper inside be lifted up to a direct sub-circle', () => {
		const rows = pickerRows(tree, { mode: 'add', subjectId: 'school', selectedId: null });
		const group = rows.find((r) => r.id === 'group');
		expect(group?.block).toBeNull();
		expect(group?.movesFrom).toBe('class');
	});
});

describe('searchPickerRows', () => {
	const rows = pickerRows(tree, { mode: 'parent', subjectId: 'class', selectedId: null });

	it('turns the tree into a flat list of the matches, blocks kept', () => {
		const found = searchPickerRows(rows, 'GROUP');
		expect(found.map((r) => [r.id, r.depth, r.block])).toEqual([
			['group', 0, { reason: 'inside', name: 'class' }]
		]);
	});

	it('keeps the whole tree for an empty query', () => {
		expect(searchPickerRows(rows, '  ')).toEqual(rows);
	});
});

describe('subCircleKindFor', () => {
	it('suggests what usually sits inside a circle of that kind', () => {
		expect(subCircleKindFor('school')).toBe('class');
		expect(subCircleKindFor('club')).toBe('team');
		expect(subCircleKindFor('work')).toBe('team');
		expect(subCircleKindFor('family')).toBe('other');
		expect(subCircleKindFor('class')).toBe('other');
	});
});
