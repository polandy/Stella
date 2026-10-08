import { describe, expect, it } from 'bun:test';
import { FOLLOWING, followView, type ViewEvent, type ViewFollow } from './view-follow';

/*
 * Whether the map is framed afresh when full screen is entered or left (docs/05 §5.8): only
 * while the view is still the one the map framed itself, and only once the canvas has actually
 * taken its new size.
 */

const small = { width: 800, height: 384 };
const large = { width: 1920, height: 1080 };

/** Runs the events in turn from `start`, and says which of them asked for a reframe. */
function run(events: ViewEvent[], start: ViewFollow = FOLLOWING) {
	let state = start;
	const reframes: boolean[] = [];
	for (const event of events) {
		const next = followView(state, event);
		state = next.state;
		reframes.push(next.reframe);
	}
	return { state, reframes };
}

describe('followView', () => {
	it('starts out following the map’s own framing', () => {
		expect(FOLLOWING.navigated).toBe(false);
	});

	it('reframes once the canvas has taken its full-screen size', () => {
		const { reframes } = run([
			{ kind: 'framed' },
			{ kind: 'screenChanged', size: small },
			{ kind: 'resized', size: large }
		]);
		expect(reframes).toEqual([false, false, true]);
	});

	it('does the same on the way back out of full screen', () => {
		const { reframes } = run([
			{ kind: 'screenChanged', size: small },
			{ kind: 'resized', size: large },
			{ kind: 'screenChanged', size: large },
			{ kind: 'resized', size: small }
		]);
		expect(reframes).toEqual([false, true, false, true]);
	});

	it('keeps the reader’s view once they have panned or zoomed', () => {
		const { reframes } = run([
			{ kind: 'framed' },
			{ kind: 'navigated' },
			{ kind: 'screenChanged', size: small },
			{ kind: 'resized', size: large }
		]);
		expect(reframes).toEqual([false, false, false, false]);
	});

	it('follows again once the map has framed itself since', () => {
		// Re-arranging the map frames it afresh: the reader's earlier pan is behind them.
		const { reframes } = run([
			{ kind: 'navigated' },
			{ kind: 'framed' },
			{ kind: 'screenChanged', size: small },
			{ kind: 'resized', size: large }
		]);
		expect(reframes.at(-1)).toBe(true);
	});

	it('drops a pending reframe when the reader moves the view before the canvas resizes', () => {
		const { reframes } = run([
			{ kind: 'screenChanged', size: small },
			{ kind: 'navigated' },
			{ kind: 'resized', size: large }
		]);
		expect(reframes.at(-1)).toBe(false);
	});

	it('waits through a resize that left the canvas the size it was', () => {
		// The canvas reports a resize for reasons of its own; only a new size is the full screen.
		const { reframes } = run([
			{ kind: 'screenChanged', size: small },
			{ kind: 'resized', size: small },
			{ kind: 'resized', size: large }
		]);
		expect(reframes).toEqual([false, false, true]);
	});

	it('waits through a canvas with no size, which has nothing to frame', () => {
		const { reframes } = run([
			{ kind: 'screenChanged', size: small },
			{ kind: 'resized', size: { width: 0, height: 0 } },
			{ kind: 'resized', size: large }
		]);
		expect(reframes).toEqual([false, false, true]);
	});

	it('reframes again when the canvas takes its new size in more than one step', () => {
		// Leaving full screen, the width can settle before the height does.
		const { reframes } = run([
			{ kind: 'screenChanged', size: large },
			{ kind: 'resized', size: { width: 1200, height: 1080 } },
			{ kind: 'resized', size: { width: 1200, height: 595 } },
			{ kind: 'resized', size: { width: 1200, height: 595 } }
		]);
		expect(reframes).toEqual([false, true, true, false]);
	});

	it('stops following the size once the reader has moved the view', () => {
		const { reframes } = run([
			{ kind: 'screenChanged', size: small },
			{ kind: 'resized', size: large },
			{ kind: 'navigated' },
			{ kind: 'resized', size: small }
		]);
		expect(reframes).toEqual([false, true, false, false]);
	});

	it('never reframes on a resize that no full-screen change preceded', () => {
		const { reframes } = run([{ kind: 'framed' }, { kind: 'resized', size: large }]);
		expect(reframes).toEqual([false, false]);
	});
});
