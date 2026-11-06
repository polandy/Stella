/*
 * The pointer Home gives a moment just saved from its composer (docs/02 §2.22.1): the sheet
 * closes over a stream the moment may have landed anywhere in, so a short toast says it was
 * saved and *Show* jumps to it — a plain `#` link, its row flashing once as the target.
 */

/** How long *Moment saved · Show* stands: a pointer, not an undo, so shorter than one window. */
export const SAVED_NOTICE_MS = 5000;

/** The element id of a moment's row in a stream, for the journal entry it landed in. */
export function savedMomentAnchor(entryId: string): string {
	return `moment-${entryId}`;
}
