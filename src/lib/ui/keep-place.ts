/*
 * Keeping the reader's place when a row leaves a list (docs/02 §2.4.1, docs/04 §4.9).
 *
 * An answered suggestion goes at once, softly. Its height — 74px in the review, measured —
 * would otherwise be taken out from under everything below it, and the next row would arrive
 * under a finger already on its way to *Decline*. So as the row closes, the list gives the same
 * height back to the scroll offset: the rows below hold still and the page simply grows shorter
 * above them.
 *
 * Nothing here touches the DOM, so the arithmetic that decides where the reader ends up is
 * testable without a browser.
 */

/** As much of an element as this needs: enough to ask whether it scrolls, and what is above it. */
export interface Scrollable {
	scrollHeight: number;
	clientHeight: number;
	parentElement: Scrollable | null;
}

/**
 * Where the scroll offset belongs once `given` pixels have left above the reader.
 *
 * Clamped at both ends: a list already at the top has nothing to give back — the rows below
 * really do move then — and a list that just got shorter may no longer reach its old offset.
 */
export const placeAfter = (scrollTop: number, given: number, room: number): number =>
	Math.max(0, Math.min(room, scrollTop - given));

/**
 * The element this node actually scrolls inside, or `null` if nothing does.
 *
 * The app scrolls in its own element rather than the window, and which element that is has
 * already moved once; asking the DOM at runtime survives the next move, where a class name
 * would not.
 */
export function scrollingAncestor(node: Scrollable | null): Scrollable | null {
	let walk = node?.parentElement ?? null;
	while (walk && walk.scrollHeight <= walk.clientHeight) walk = walk.parentElement;
	return walk;
}
