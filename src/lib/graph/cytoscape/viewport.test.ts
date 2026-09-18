import { describe, expect, it } from 'bun:test';
import { frameBelow, widenToReveal, type Box } from './viewport';

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

describe('frameBelow', () => {
	const map = box(0, 0, 1000, 400);
	const SCREEN_WIDE = { width: 1200, height: 800 };
	const TOP = 100;

	it('fits the whole map into the part of the canvas the toolbar leaves free', () => {
		const next = frameBelow(map, SCREEN_WIDE, TOP, PADDING, { min: MIN_ZOOM, max: 3 });
		const topLeft = onScreen(0, 0, next);
		const bottomRight = onScreen(1000, 400, next);

		expect(topLeft.y).toBeGreaterThanOrEqual(TOP + PADDING - 1e-9);
		expect(topLeft.x).toBeGreaterThanOrEqual(PADDING - 1e-9);
		expect(bottomRight.x).toBeLessThanOrEqual(SCREEN_WIDE.width - PADDING + 1e-9);
		expect(bottomRight.y).toBeLessThanOrEqual(SCREEN_WIDE.height - PADDING + 1e-9);
	});

	it('centres the map in that free part', () => {
		const next = frameBelow(map, SCREEN_WIDE, TOP, PADDING, { min: MIN_ZOOM, max: 3 });
		const middle = onScreen(500, 200, next);

		expect(middle.x).toBeCloseTo(SCREEN_WIDE.width / 2);
		expect(middle.y).toBeCloseTo(TOP + (SCREEN_WIDE.height - TOP) / 2);
	});

	it('does not blow a tiny map up past the largest zoom', () => {
		const next = frameBelow(box(0, 0, 10, 10), SCREEN_WIDE, TOP, PADDING, {
			min: MIN_ZOOM,
			max: 1.5
		});

		expect(next.zoom).toBe(1.5);
	});

	it('stops at the smallest zoom for a map too big to fit', () => {
		const next = frameBelow(box(0, 0, 100_000, 100), SCREEN_WIDE, TOP, PADDING, {
			min: MIN_ZOOM,
			max: 3
		});

		expect(next.zoom).toBe(MIN_ZOOM);
	});
});
