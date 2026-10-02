/*
 * When the phone's top bar gets out of the way (docs/05 §5.4): it slides away while the
 * reader scrolls down and comes back as soon as they scroll up, so the search and the add
 * button are one flick away without taking a row of the screen all the time. Kept out of the
 * shell so the thresholds test without a browser; the shell only feeds it scroll positions.
 */

/** Where the bar stands, and how far the reader has scrolled since the direction last changed. */
export interface TopBarState {
	hidden: boolean;
	/** The last scroll position seen. */
	y: number;
	/** Signed distance scrolled in the current direction: positive is down. */
	travel: number;
}

/** How far the reader scrolls in one direction before the bar follows — a nudge is not a scroll. */
export const TOP_BAR_TRAVEL_PX = 24;

/** A page opens with its bar showing. */
export const SHOWN_TOP_BAR: TopBarState = { hidden: false, y: 0, travel: 0 };

/**
 * The bar after the page scrolled to `y`, of at most `maxY`. Within the bar's own height of the
 * top it always shows — there is nothing under it to make room for, and an overscroll above the
 * top reads as the top too. Within the bar's height of the bottom it stays as it is: sliding it
 * away makes the page that much taller and pulls the scroll back, which would read as scrolling
 * up and bring it back, over and over.
 */
export function followScroll(state: TopBarState, y: number, barHeight: number, maxY: number): TopBarState {
	const step = y - state.y;
	const sameDirection = Math.sign(step) === Math.sign(state.travel);
	const travel = sameDirection ? state.travel + step : step;

	let hidden = state.hidden;
	if (y <= barHeight) hidden = false;
	else if (y >= maxY - barHeight) {
		// Near the bottom: leave it as it stands (see above).
	} else if (travel >= TOP_BAR_TRAVEL_PX) hidden = true;
	else if (travel <= -TOP_BAR_TRAVEL_PX) hidden = false;

	return { hidden, y, travel };
}
