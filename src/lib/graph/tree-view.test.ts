import { describe, expect, it } from 'bun:test';
import {
	labelsAfterArranging,
	labelsOn,
	selectionAsked,
	treeRelaidFor,
	toggledLabels,
	type LabelsState
} from './tree-view';

/*
 * How the Labels switch reads in the family tree (docs/05 §5.8). Elsewhere it is the reader's
 * habit, kept per device; in the tree the roles under the names already say what the line names
 * would, so the tree starts with them off — and the switch still turns them on and off there,
 * without touching the habit the other arrangements go back to.
 */

const habitOn: LabelsState = { habit: true, inTree: false };

describe('labelsOn', () => {
	it('follows the reader’s habit outside the tree', () => {
		expect(labelsOn(habitOn, false)).toBe(true);
		expect(labelsOn({ habit: false, inTree: true }, false)).toBe(false);
	});

	it('follows the tree’s own choice while the roles are written under the names', () => {
		expect(labelsOn(habitOn, true)).toBe(false);
		expect(labelsOn({ habit: false, inTree: true }, true)).toBe(true);
	});
});

describe('toggledLabels', () => {
	it('turns the tree’s names on and off, leaving the habit as it was', () => {
		const on = toggledLabels(habitOn, true);

		expect(on).toEqual({ habit: true, inTree: true });
		expect(toggledLabels(on, true)).toEqual(habitOn);
	});

	it('turns the habit outside the tree, leaving the tree’s choice as it was', () => {
		expect(toggledLabels(habitOn, false)).toEqual({ habit: false, inTree: false });
	});
});

describe('labelsAfterArranging', () => {
	it('starts the tree with its names off, whatever was chosen in it before', () => {
		const chosen = { habit: true, inTree: true };

		expect(labelsAfterArranging(chosen, 'force', 'tree')).toEqual(habitOn);
		expect(labelsAfterArranging(chosen, 'circles', 'tree')).toEqual(habitOn);
	});

	it('keeps the tree’s choice when the tree is tidied again', () => {
		const chosen = { habit: true, inTree: true };

		expect(labelsAfterArranging(chosen, 'tree', 'tree')).toEqual(chosen);
	});

	it('goes back to the habit on leaving the tree', () => {
		const chosen = { habit: false, inTree: true };
		const after = labelsAfterArranging(chosen, 'tree', 'force');

		expect(labelsOn(after, false)).toBe(false);
		expect(after.habit).toBe(false);
	});
});

describe('selectionAsked', () => {
	it('counts a person the reader tapped or found as a question about their lines', () => {
		expect(selectionAsked('tapped')).toBe(true);
		expect(selectionAsked('found')).toBe(true);
	});

	it('counts nobody as asked once an expand has laid the tree out again', () => {
		// The person just expanded is still selected, but their friends' and circles' lines would
		// fan out across the new tree; they wait for the next tap, like the opening centre's.
		expect(selectionAsked('treeRelaid')).toBe(false);
		expect(selectionAsked('opened')).toBe(false);
	});
});

describe('treeRelaidFor', () => {
	const before = new Set(['lena', 'markus']);

	it('lays the tree out again when somebody new comes onto it', () => {
		expect(treeRelaidFor('tree', before, new Set(['lena', 'markus', 'peter']))).toBe(true);
	});

	it('moves nobody when nobody came, nor in the other arrangements', () => {
		expect(treeRelaidFor('tree', before, new Set(['lena', 'markus']))).toBe(false);
		expect(treeRelaidFor('tree', before, new Set(['lena']))).toBe(false);
		expect(treeRelaidFor('force', before, new Set(['lena', 'markus', 'peter']))).toBe(false);
		expect(treeRelaidFor('circles', before, new Set(['lena', 'markus', 'peter']))).toBe(false);
	});
});
