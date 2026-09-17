import { describe, expect, it } from 'bun:test';
import { placeAfter, scrollingAncestor, type Scrollable } from './keep-place';

/*
 * Keeping the reader's place when a row leaves a list (docs/02 §2.4.1, docs/05 §5.4).
 *
 * An answered suggestion goes at once. Everything below it would then move up by the height it
 * gave back — 74px, measured — and the next row would land under the finger that was already
 * on its way to *Decline*. So the list gives the same height back to the scroll offset, and the
 * rows below stay where the reader left them.
 *
 * The one case this cannot save is a list already at the top: there is nothing to give back,
 * and the rows below move. That is the honest limit of the approach, and it is a case as well.
 */

const scroller = (over: Partial<Scrollable> = {}): Scrollable => ({
	scrollHeight: 1000,
	clientHeight: 400,
	parentElement: null,
	...over
});

describe('placeAfter', () => {
	it('gives back exactly the height that left, so nothing below moves', () => {
		expect(placeAfter(300, 74, 600)).toBe(226);
	});

	/* At the top there is nothing to give back; the rows below do move, and no arithmetic hides it. */
	it('stops at the top rather than scrolling into nothing', () => {
		expect(placeAfter(40, 74, 600)).toBe(0);
		expect(placeAfter(0, 74, 600)).toBe(0);
	});

	/* The list is shorter now, so the last legal offset moved too. */
	it('never asks for an offset the shortened list no longer has', () => {
		expect(placeAfter(600, 74, 500)).toBe(500);
	});

	it('does nothing when nothing left', () => {
		expect(placeAfter(300, 0, 600)).toBe(300);
	});
});

describe('scrollingAncestor', () => {
	/*
	 * The app scrolls inside its own element, not the window (`(app)/+layout.svelte`), and which
	 * element that is has moved once already. Finding it at runtime keeps this working when the
	 * shell's markup changes; looking it up by class would not.
	 */
	it('finds the first ancestor that actually scrolls', () => {
		const page = scroller({ scrollHeight: 2000, clientHeight: 800 });
		const inner = scroller({ scrollHeight: 300, clientHeight: 300, parentElement: page });
		const row = scroller({ scrollHeight: 74, clientHeight: 74, parentElement: inner });
		expect(scrollingAncestor(row)).toBe(page);
	});

	it('answers with nothing when the page itself is short enough to fit', () => {
		const page = scroller({ scrollHeight: 400, clientHeight: 400 });
		const row = scroller({ scrollHeight: 74, clientHeight: 74, parentElement: page });
		expect(scrollingAncestor(row)).toBe(null);
	});

	it('answers with nothing for a node that has no ancestors at all', () => {
		expect(scrollingAncestor(null)).toBe(null);
	});
});
