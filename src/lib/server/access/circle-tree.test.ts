import { describe, expect, it } from 'bun:test';
import { circleTreeVisibleTo, type CircleTreeRow } from './circle-tree';
import type { Viewer } from './visibility';

/*
 * The nesting as one reader may see it (docs/02 §2.4.2, docs/03 §3.7): a private circle of
 * someone else is left out and only counted under a parent the reader sees, and a circle whose
 * parent is hidden stands on top.
 */

const ME: Viewer = { id: 'me', householdId: 'h' };

function row(
	id: string,
	parentId: string | null,
	fields: Partial<CircleTreeRow> = {}
): CircleTreeRow {
	return {
		id,
		parentId,
		householdId: 'h',
		createdBy: 'someone',
		visibility: 'shared',
		name: id,
		description: null,
		kind: 'other',
		color: 'blue',
		startDate: null,
		endDate: null,
		memberCount: 0,
		...fields
	};
}

describe('circleTreeVisibleTo', () => {
	it('keeps the shared circles and the reader’s own private ones, with their parents', () => {
		const tree = circleTreeVisibleTo(ME, [
			row('school', null),
			row('class', 'school', { memberCount: 3 }),
			row('mine', 'school', { visibility: 'private', createdBy: 'me' })
		]);
		expect(tree.map((c) => [c.id, c.parentId, c.memberCount, c.hiddenChildCount])).toEqual([
			['school', null, 0, 0],
			['class', 'school', 3, 0],
			['mine', 'school', 0, 0]
		]);
	});

	it('leaves out someone else’s private circle and counts it under its visible parent', () => {
		const tree = circleTreeVisibleTo(ME, [
			row('club', null),
			row('team', 'club'),
			row('secret', 'club', { visibility: 'private', name: 'Secret squad' })
		]);
		expect(tree.map((c) => c.id)).toEqual(['club', 'team']);
		expect(tree.find((c) => c.id === 'club')?.hiddenChildCount).toBe(1);
		// Nothing of the hidden circle is handed on, not even its name.
		expect(JSON.stringify(tree)).not.toContain('Secret squad');
	});

	it('puts a visible circle whose parent is hidden on top, without the hidden id', () => {
		const tree = circleTreeVisibleTo(ME, [
			row('hidden', null, { visibility: 'private' }),
			row('orphan', 'hidden')
		]);
		expect(tree).toEqual([expect.objectContaining({ id: 'orphan', parentId: null })]);
	});

	it('sees nothing of another household', () => {
		expect(circleTreeVisibleTo(ME, [row('theirs', null, { householdId: 'other' })])).toEqual([]);
	});
});
