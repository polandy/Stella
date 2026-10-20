import type { Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import { CircleGoneError, readCircleDetails } from './circle-details';
import type { CircleDetailsInput, CircleRepository } from './circles';
import {
	applyCircleMove,
	planCircleMove,
	type CircleMove,
	type CircleNestingDeps
} from './nesting';

/*
 * Editing a circle (docs/02 §2.4.2): its name, kind, colour, description, period and the circle it
 * belongs to — the one place a parent is chosen, checked as every move is (`./nesting`). Anyone who
 * sees the circle may, as anyone may rename its roles — a circle is a household fact. Its
 * visibility is not among the details: making a shared circle private would hide every
 * membership and photo from the household, a question of its own. Nothing is written to the
 * stream; the new name shows wherever the circle appears.
 */

export interface UpdateCircleDeps {
	circles: Pick<CircleRepository, 'update'> & CircleNestingDeps['circles'];
	nesting: CircleNestingDeps['nesting'];
	clock: Clock;
}

/** What the edit form posts: the details, and the parent when it offers one (null: none). */
export interface UpdateCircleInput extends CircleDetailsInput {
	parentId?: string | null;
}

/**
 * Give `circleId` the details in `input`, validated as creating a circle validates them, and the
 * parent it names. Everything is checked before anything is written. The write is scoped to what
 * the viewer sees, so a circle they cannot see, or one deleted while the form was open, answers
 * `CircleGoneError`. Answers the move when a parent was sent (from === to: it stayed), else null.
 */
export async function updateCircle(
	deps: UpdateCircleDeps,
	viewer: Viewer,
	circleId: string,
	input: UpdateCircleInput
): Promise<CircleMove | null> {
	const details = readCircleDetails(input);
	const move =
		input.parentId === undefined
			? null
			: await planCircleMove(deps, viewer, circleId, input.parentId);
	const updated = await deps.circles.update(viewer, circleId, details, deps.clock.now());
	if (!updated) throw new CircleGoneError();
	if (move) await applyCircleMove(deps, viewer, move);
	return move;
}
