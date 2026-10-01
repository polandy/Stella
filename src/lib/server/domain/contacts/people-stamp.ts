import type { Viewer } from '../../access/visibility';

/*
 * The stamp of the people the app shell carries (docs/04 §4.9). A page that kept the shell
 * across a navigation asks for it to tell whether its list is still current, so it has to be
 * cheap — far cheaper than reading the list it stands for — and it has to move with every
 * write that would change that list or the namesake context sent with it.
 *
 * It is made of markers rather than of the content: counts and latest-change times of the
 * people, links, circles and memberships the viewer may see, plus the few values that
 * `updated_at` does not follow (an avatar, a household type's labels, a circle's own fields).
 * Scoped like every other read, so another member's private person never moves it.
 */

/** The markers of everything the shell's people and their context are read from. */
export interface PeopleStampReads {
	markersVisibleTo(viewer: Viewer): Promise<string>;
}

export interface PeopleStampDeps {
	stamps: PeopleStampReads;
}

/**
 * What the shell's stamp is made of: the markers, and the two inputs of the namesake context
 * that are not in the database — who the reader is in the household, and today's date.
 */
export async function peopleStampOf(
	deps: PeopleStampDeps,
	viewer: Viewer,
	input: { selfContactId: string | null; today: string }
): Promise<string> {
	const markers = await deps.stamps.markersVisibleTo(viewer);
	return JSON.stringify([markers, input.selfContactId, input.today]);
}
