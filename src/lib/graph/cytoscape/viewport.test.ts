import { describe, expect, it } from 'bun:test';
import { widenToReveal, type Box } from './viewport';

/*
 * Bringing an expand's newcomers into view without losing the view the reader had: the frame
 * only ever widens, so everything they were looking at stays on screen, where it was relative
 * to everything else.
 */

const box = (x1: number, y1: number, x2: number, y2: number): Box => ({ x1, y1, x2, y2 });

const SCREEN = { width: 800, height: 600 };
const PADDING = 20;
const MIN_ZOOM = 0.2;

/** A viewport showing model 0..800 × 0..600 at zoom 1. */
const view = { extent: box(0, 0, 800, 600), zoom: 1 };

/** Where a model point lands on screen under a viewport. */
const onScreen = (x: number, y: number, v: { zoom: number; pan: { x: number; y: number } }) => ({
	x: x * v.zoom + v.pan.x,
	y: y * v.zoom + v.pan.y
});

describe('widenToReveal', () => {
	it('leaves the view alone when the newcomers are already in it', () => {
		expect(widenToReveal(view, box(300, 200, 400, 300), SCREEN, PADDING, MIN_ZOOM)).toBeNull();
	});

	it('widens to take in newcomers that landed off screen', () => {
		const next = widenToReveal(view, box(900, 200, 1000, 300), SCREEN, PADDING, MIN_ZOOM)!;

		const far = onScreen(1000, 300, next);
		expect(far.x).toBeLessThanOrEqual(SCREEN.width);
		expect(far.y).toBeLessThanOrEqual(SCREEN.height);
	});

	it('keeps everything the reader was looking at on screen', () => {
		const next = widenToReveal(view, box(900, 200, 1000, 300), SCREEN, PADDING, MIN_ZOOM)!;

		for (const [x, y] of [
			[0, 0],
			[800, 600]
		]) {
			const p = onScreen(x, y, next);
			expect(p.x).toBeGreaterThanOrEqual(0);
			expect(p.x).toBeLessThanOrEqual(SCREEN.width);
			expect(p.y).toBeGreaterThanOrEqual(0);
			expect(p.y).toBeLessThanOrEqual(SCREEN.height);
		}
	});

	it('never zooms in, only out', () => {
		const next = widenToReveal(view, box(-50, 200, 10, 300), SCREEN, PADDING, MIN_ZOOM)!;

		expect(next.zoom).toBeLessThanOrEqual(view.zoom);
	});

	it('stops at the smallest zoom the canvas allows', () => {
		const next = widenToReveal(view, box(90_000, 0, 90_100, 100), SCREEN, PADDING, MIN_ZOOM)!;

		expect(next.zoom).toBe(MIN_ZOOM);
	});
});
