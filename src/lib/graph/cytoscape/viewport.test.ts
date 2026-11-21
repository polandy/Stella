import { describe, expect, it } from 'bun:test';
import {
	frameBelow,
	frameLegibly,
	outsideOf,
	widenToReveal,
	type Box,
	type Covered
} from './viewport';

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
		const next = frameBelow(map, SCREEN_WIDE, { top: TOP }, PADDING, { min: MIN_ZOOM, max: 3 });
		const topLeft = onScreen(0, 0, next);
		const bottomRight = onScreen(1000, 400, next);

		expect(topLeft.y).toBeGreaterThanOrEqual(TOP + PADDING - 1e-9);
		expect(topLeft.x).toBeGreaterThanOrEqual(PADDING - 1e-9);
		expect(bottomRight.x).toBeLessThanOrEqual(SCREEN_WIDE.width - PADDING + 1e-9);
		expect(bottomRight.y).toBeLessThanOrEqual(SCREEN_WIDE.height - PADDING + 1e-9);
	});

	it('centres the map in that free part', () => {
		const next = frameBelow(map, SCREEN_WIDE, { top: TOP }, PADDING, { min: MIN_ZOOM, max: 3 });
		const middle = onScreen(500, 200, next);

		expect(middle.x).toBeCloseTo(SCREEN_WIDE.width / 2);
		expect(middle.y).toBeCloseTo(TOP + (SCREEN_WIDE.height - TOP) / 2);
	});

	it('does not blow a tiny map up past the largest zoom', () => {
		const next = frameBelow(box(0, 0, 10, 10), SCREEN_WIDE, { top: TOP }, PADDING, {
			min: MIN_ZOOM,
			max: 1.5
		});

		expect(next.zoom).toBe(1.5);
	});

	it('stops at the smallest zoom for a map too big to fit', () => {
		const next = frameBelow(box(0, 0, 100_000, 100), SCREEN_WIDE, { top: TOP }, PADDING, {
			min: MIN_ZOOM,
			max: 3
		});

		expect(next.zoom).toBe(MIN_ZOOM);
	});

	it('keeps the map clear of a panel over the right or the bottom of the canvas too', () => {
		// The peek panel stands beside the map on a wide screen and along its foot on a phone.
		const covered = { top: TOP, right: 300, bottom: 150 };
		const next = frameBelow(map, SCREEN_WIDE, covered, PADDING, { min: MIN_ZOOM, max: 3 });
		const topLeft = onScreen(0, 0, next);
		const bottomRight = onScreen(1000, 400, next);

		expect(topLeft.x).toBeGreaterThanOrEqual(PADDING - 1e-9);
		expect(topLeft.y).toBeGreaterThanOrEqual(TOP + PADDING - 1e-9);
		expect(bottomRight.x).toBeLessThanOrEqual(SCREEN_WIDE.width - 300 - PADDING + 1e-9);
		expect(bottomRight.y).toBeLessThanOrEqual(SCREEN_WIDE.height - 150 - PADDING + 1e-9);
		const middle = onScreen(500, 200, next);
		expect(middle.x).toBeCloseTo((SCREEN_WIDE.width - 300) / 2);
	});
});

describe('frameLegibly', () => {
	const SCREEN = { width: 1000, height: 700 };
	const covered = { top: 80 };
	const zoom = { min: MIN_ZOOM, max: 2.5, legible: 0.51, readable: 0.64 };
	const frame = (map: Box, core: Box, point: { x: number; y: number }, cover: Covered = covered) =>
		frameLegibly(map, { box: core, point }, SCREEN, cover, PADDING, zoom);
	const inFree = (x: number, y: number, next: ReturnType<typeof frame>) => {
		const at = onScreen(x, y, next);
		return (
			at.x >= PADDING - 1e-9 &&
			at.x <= SCREEN.width - PADDING + 1e-9 &&
			at.y >= covered.top + PADDING - 1e-9 &&
			at.y <= SCREEN.height - PADDING + 1e-9
		);
	};

	it('frames like frameBelow while the whole map fits at a readable size', () => {
		const map = box(0, 0, 800, 500);

		expect(frame(map, box(300, 0, 500, 500), { x: 400, y: 250 })).toEqual(
			frameBelow(map, SCREEN, covered, PADDING, zoom)
		);
	});

	it('frames the core family at the readable zoom, the wide cousin row left to pan to', () => {
		const map = box(0, 0, 2400, 900);
		const core = box(800, 0, 1600, 900);
		const next = frame(map, core, { x: 1300, y: 450 });

		expect(next.zoom).toBe(zoom.readable);
		expect(inFree(800, 0, next) && inFree(1600, 900, next)).toBe(true);
		expect(onScreen(1300, 0, next).x).toBeCloseTo(SCREEN.width / 2);
		expect(inFree(0, 450, next) || inFree(2400, 450, next)).toBe(false);
	});

	it('zooms out as far as the core family needs, when it fits only below the readable zoom', () => {
		const map = box(0, 0, 3000, 500);
		const core = box(0, 0, 1800, 500);
		const next = frame(map, core, { x: 900, y: 250 });

		expect(next.zoom).toBeCloseTo(960 / 1800);
		expect(inFree(0, 0, next) && inFree(1800, 500, next)).toBe(true);
	});

	it('never zooms past the legible zoom; a core wider than that centres on the centre person', () => {
		const map = box(0, 0, 4000, 1600);
		const core = box(0, 0, 4000, 900);
		const next = frame(map, core, { x: 3000, y: 450 });

		expect(next.zoom).toBe(zoom.legible);
		expect(onScreen(3000, 0, next).x).toBeCloseTo(SCREEN.width / 2);
		expect(onScreen(0, 0, next).y).toBeCloseTo(covered.top + PADDING);
	});

	it('shows no empty room beyond the map when the centre person stands near its edge', () => {
		const next = frame(box(0, 0, 4000, 900), box(0, 0, 4000, 900), { x: 100, y: 450 });

		expect(onScreen(0, 0, next).x).toBeCloseTo(PADDING);
	});

	it('shows a tall map from the top of the core family, the shelf beneath left to pan to', () => {
		const next = frame(box(0, 0, 1200, 1600), box(0, 0, 1200, 900), { x: 600, y: 450 });

		expect(next.zoom).toBe(zoom.readable);
		expect(onScreen(0, 0, next).y).toBeCloseTo(covered.top + PADDING);
		expect(onScreen(0, 1600, next).y).toBeGreaterThan(SCREEN.height);
	});

	it('keeps clear of a panel at the right when it centres', () => {
		const map = box(0, 0, 4000, 1600);
		const next = frame(map, map, { x: 2000, y: 0 }, { top: 80, right: 300 });

		expect(onScreen(2000, 0, next).x).toBeCloseTo((SCREEN.width - 300) / 2);
	});
});

describe('outsideOf', () => {
	it('counts the people wholly off the view to either side, not those it cuts', () => {
		const view = box(0, 0, 1000, 700);
		const people = [
			box(-300, 0, -200, 50),
			box(-50, 0, 50, 50),
			box(400, 0, 500, 50),
			box(1100, 0, 1200, 50),
			box(1300, 900, 1400, 950)
		];

		expect(outsideOf(people, view)).toEqual({ left: 1, right: 2 });
	});
});
