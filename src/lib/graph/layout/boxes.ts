import type { Point } from './geometry';

/*
 * The boxes the canvas frames by (docs/05 §5.8). Pure arithmetic, so the renderer only measures
 * and these decide: what a framing takes in, and whether something already stands in view.
 */

/** An axis-aligned box, from its top-left to its bottom-right corner. */
export interface Box {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

/** The box around both. */
export function unionBox(a: Box, b: Box): Box {
	return {
		x1: Math.min(a.x1, b.x1),
		y1: Math.min(a.y1, b.y1),
		x2: Math.max(a.x2, b.x2),
		y2: Math.max(a.y2, b.y2)
	};
}

/** The box around `points`, `margin` wider on every side. */
export function boxAroundPoints(points: readonly Point[], margin: number): Box {
	return {
		x1: Math.min(...points.map((p) => p.x)) - margin,
		y1: Math.min(...points.map((p) => p.y)) - margin,
		x2: Math.max(...points.map((p) => p.x)) + margin,
		y2: Math.max(...points.map((p) => p.y)) + margin
	};
}

/**
 * Whether `box`, in screen pixels, stands wholly on a screen of `screen`'s size below the
 * `topInset` pixels the toolbar covers.
 */
export function withinScreen(
	box: Box,
	screen: { width: number; height: number },
	topInset: number
): boolean {
	return box.x1 >= 0 && box.x2 <= screen.width && box.y1 >= topInset && box.y2 <= screen.height;
}
