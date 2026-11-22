import { occasionDayOf } from '../../../gifts/occasions';
import { todayFor } from '../../../dates/today';
import type { Viewer } from '../../access/visibility';
import type { GiftDeps, OpenIdea } from './gifts';

/**
 * The open and bought gifts the viewer may see, each with the day of its occasion or null — what
 * the household's list shows by occasion (docs/dev/02 §2.25.6).
 */
export async function listPlanned(
	deps: Pick<GiftDeps, 'gifts'>,
	viewer: Viewer
): Promise<(OpenIdea & { on: string | null })[]> {
	return (await deps.gifts.listPlannedVisibleTo(viewer)).map(({ birth, ...gift }) => ({
		...gift,
		on: occasionDayOf(gift, birth)
	}));
}

/** Those of `planned` whose day has come or gone — what *Nachtragen…* may tick (§2.25.14). */
export function passedOf<T extends { on: string | null }>(
	planned: readonly T[],
	today: string
): (T & { on: string })[] {
	return planned.filter((gift): gift is T & { on: string } => gift.on !== null && gift.on <= today);
}

/** `listPlanned`, narrowed to the passed ones. */
export async function listPassedPlanned(
	deps: Pick<GiftDeps, 'gifts' | 'clock'>,
	viewer: Viewer
): Promise<(OpenIdea & { on: string })[]> {
	return passedOf(await listPlanned(deps, viewer), todayFor(deps.clock));
}
