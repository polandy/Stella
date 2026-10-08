import type { ArrangementKey } from './layout/arrangements';

/*
 * How the Labels switch reads in the family tree (docs/05 §5.8). Pure.
 *
 * Elsewhere the switch is the reader's habit, kept per device (`view-switches.ts`). In the tree
 * around a person the roles under the names say what the line names would, so the tree starts
 * with them off; the same switch still turns them on and off there. That choice is the tree's
 * own and lasts while the tree is the arrangement: it never overwrites the habit, so leaving the
 * tree brings back exactly what applied before, and entering it again starts from off.
 */

export interface LabelsState {
	/** The reader's Labels switch as this device keeps it, for every other arrangement. */
	habit: boolean;
	/** The switch inside the tree; off each time the tree is entered. */
	inTree: boolean;
}

/** Whether the switch stands on, with `rolesInstead` true while the tree writes roles. */
export function labelsOn(state: LabelsState, rolesInstead: boolean): boolean {
	return rolesInstead ? state.inTree : state.habit;
}

/** The state after the reader flips the switch: the tree's choice in the tree, else the habit. */
export function toggledLabels(state: LabelsState, rolesInstead: boolean): LabelsState {
	return rolesInstead ? { ...state, inTree: !state.inTree } : { ...state, habit: !state.habit };
}

/** The state after arranging `from` one way `to` another: entering the tree starts it off. */
export function labelsAfterArranging(
	state: LabelsState,
	from: ArrangementKey,
	to: ArrangementKey
): LabelsState {
	return to === 'tree' && from !== 'tree' ? { ...state, inTree: false } : state;
}
