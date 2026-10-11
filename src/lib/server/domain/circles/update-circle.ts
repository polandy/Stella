import type { Viewer } from '../../access/visibility';
import type { Clock } from '../../clock';
import { CircleGoneError, readCircleDetails } from './circle-details';
import type { CircleDetailsInput, CircleRepository } from './circles';

/*
 * Editing a circle (docs/02 §2.4.2): its name, kind, colour, description and period. Anyone who
 * sees the circle may, as anyone may rename its roles — a circle is a household fact. Its
 * visibility is not among the details: making a shared circle private would hide every
 * membership and photo from the household, a question of its own. Nothing is written to the
 * stream; the new name shows wherever the circle appears.
 */

export interface UpdateCircleDeps {
	circles: Pick<CircleRepository, 'update'>;
	clock: Clock;
}

/**
 * Give `circleId` the details in `input`, validated as creating a circle validates them. The
 * write is scoped to what the viewer sees, so a circle they cannot see, or one deleted while the
 * form was open, answers `CircleGoneError`.
 */
export async function updateCircle(
	deps: UpdateCircleDeps,
	viewer: Viewer,
	circleId: string,
	input: CircleDetailsInput
): Promise<void> {
	const details = readCircleDetails(input);
	const updated = await deps.circles.update(viewer, circleId, details, deps.clock.now());
	if (!updated) throw new CircleGoneError();
}
