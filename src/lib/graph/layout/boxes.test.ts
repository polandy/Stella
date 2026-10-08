import { describe, expect, it } from 'bun:test';
import { boxAroundPoints, unionBox, withinScreen } from './boxes';

/*
 * The boxes the canvas frames by (docs/05 §5.8): what a framing takes in, and whether something
 * already stands in view below the toolbar.
 */

describe('unionBox', () => {
	it('takes in both boxes', () => {
		expect(unionBox({ x1: 0, y1: 10, x2: 50, y2: 20 }, { x1: -5, y1: 15, x2: 40, y2: 90 })).toEqual(
			{ x1: -5, y1: 10, x2: 50, y2: 90 }
		);
	});
});

describe('boxAroundPoints', () => {
	it('reaches the margin past the outermost points', () => {
		const points = [
			{ x: 0, y: 0 },
			{ x: 100, y: -20 },
			{ x: 40, y: 60 }
		];

		expect(boxAroundPoints(points, 10)).toEqual({ x1: -10, y1: -30, x2: 110, y2: 70 });
	});
});

describe('withinScreen', () => {
	const screen = { width: 800, height: 600 };

	it('holds a box wholly on screen below the toolbar', () => {
		expect(withinScreen({ x1: 10, y1: 60, x2: 100, y2: 120 }, screen, 60)).toBe(true);
	});

	it('does not hold a box reaching under the toolbar', () => {
		expect(withinScreen({ x1: 10, y1: 59, x2: 100, y2: 120 }, screen, 60)).toBe(false);
	});

	it('does not hold a box reaching past any edge of the screen', () => {
		expect(withinScreen({ x1: -1, y1: 100, x2: 100, y2: 200 }, screen, 0)).toBe(false);
		expect(withinScreen({ x1: 0, y1: 100, x2: 801, y2: 200 }, screen, 0)).toBe(false);
		expect(withinScreen({ x1: 0, y1: 100, x2: 100, y2: 601 }, screen, 0)).toBe(false);
	});
});
