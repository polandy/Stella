import { occasionDayOf } from '../../../gifts/occasions';
import { todayFor } from '../../../dates/today';
import type { Viewer } from '../../access/visibility';
import type { GiftDeps, OpenIdea } from './gifts';

/**
 * The open and bought gifts the viewer may see whose occasion's day has come or gone, each with
 * that day — what *Nachtragen…* on the household's list may tick (docs/dev/02 §2.25.14).
 */
export async function listPassedPlanned(
	deps: Pick<GiftDeps, 'gifts' | 'clock'>,
	viewer: Viewer
): Promise<(OpenIdea & { on: string })[]> {
	const today = todayFor(deps.clock);
	return (await deps.gifts.listPlannedVisibleTo(viewer)).flatMap(({ birth, ...gift }) => {
		const on = occasionDayOf(gift, birth);
		return on !== null && on <= today ? [{ ...gift, on }] : [];
	});
}
