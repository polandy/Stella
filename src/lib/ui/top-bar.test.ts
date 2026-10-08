import { describe, expect, it } from 'bun:test';
import { SHOWN_TOP_BAR, TOP_BAR_TRAVEL_PX, followScroll, type TopBarState } from './top-bar';

/*
 * The phone's top bar slides away while the reader scrolls down and comes back as soon as
 * they scroll up (docs/05 §5.4). Pure, so the thresholds are stated here rather than felt out
 * on a device.
 */

/** Feeds a run of scroll positions through, as the scroll events would. */
function scrollThrough(
	positions: number[],
	barHeight = 60,
	from: TopBarState = SHOWN_TOP_BAR,
	maxY = 10_000
): TopBarState {
	return positions.reduce((state, y) => followScroll(state, y, barHeight, maxY), from);
}

describe('followScroll', () => {
	it('starts shown', () => {
		expect(SHOWN_TOP_BAR.hidden).toBe(false);
	});

	it('hides once the reader has scrolled down past the bar by more than a nudge', () => {
		expect(scrollThrough([40, 80, 120]).hidden).toBe(true);
	});

	it('stays while the page is still within the bar’s own height, so the top never loses it', () => {
		expect(scrollThrough([20, 40, 60]).hidden).toBe(false);
	});

	it('ignores a nudge down smaller than the travel it takes, so a shaky thumb does not flicker it', () => {
		const shownDeepDown = scrollThrough([400, 300]);
		expect(shownDeepDown.hidden).toBe(false);

		expect(scrollThrough([300 + TOP_BAR_TRAVEL_PX - 1], 60, shownDeepDown).hidden).toBe(false);
		expect(scrollThrough([300 + TOP_BAR_TRAVEL_PX], 60, shownDeepDown).hidden).toBe(true);
	});

	it('comes back once the reader scrolls up by the same travel, anywhere on the page', () => {
		const hidden = scrollThrough([200, 400, 600]);
		expect(hidden.hidden).toBe(true);

		expect(scrollThrough([600 - TOP_BAR_TRAVEL_PX + 1], 60, hidden).hidden).toBe(true);
		expect(scrollThrough([600 - TOP_BAR_TRAVEL_PX], 60, hidden).hidden).toBe(false);
	});

	it('counts the travel from where the direction last changed, not from the first event', () => {
		// Up 20, down 5, up 20: neither upward stretch is enough alone, and the downward step
		// between them starts the count over, so the two never add up to a return.
		const state = scrollThrough([600, 580, 585, 565]);
		expect(state.hidden).toBe(true);
	});

	it('shows at the very top, including the rubber-band overscroll above it', () => {
		const hidden = scrollThrough([200, 400]);
		expect(scrollThrough([0], 60, hidden).hidden).toBe(false);
		expect(scrollThrough([-30], 60, hidden).hidden).toBe(false);
	});

	it('does not bounce at the bottom when hiding it gives the page room and pulls the scroll back', () => {
		// Hiding the bar makes the scroller 60 px taller, so a page scrolled to its end (1000)
		// is clamped back to the new end (940). That pull is not the reader scrolling up.
		const hiddenAtEnd = scrollThrough([900, 950, 1000], 60, SHOWN_TOP_BAR, 1000);
		expect(hiddenAtEnd.hidden).toBe(true);

		expect(scrollThrough([970, 940], 60, hiddenAtEnd, 940).hidden).toBe(true);
	});

	it('ignores the rubber-band overscroll past the bottom', () => {
		const hiddenAtEnd = scrollThrough([900, 950, 1000], 60, SHOWN_TOP_BAR, 1000);
		expect(scrollThrough([1040, 1000], 60, hiddenAtEnd, 1000).hidden).toBe(true);
	});

	it('comes back once the reader scrolls up out of the last bar’s height of the page', () => {
		const hiddenAtEnd = scrollThrough([900, 950, 1000], 60, SHOWN_TOP_BAR, 1000);
		expect(scrollThrough([960, 941], 60, hiddenAtEnd, 1000).hidden).toBe(true);
		expect(scrollThrough([960, 939], 60, hiddenAtEnd, 1000).hidden).toBe(false);
	});
});
