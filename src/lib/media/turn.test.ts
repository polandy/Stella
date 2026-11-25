import { describe, expect, it } from 'bun:test';
import { cropRect, initialCrop, type ImageSize } from './crop';
import { turnCrop, turned, turnedSize, turnPlan, turnStyle } from './turn';

/*
 * Turning a picture a quarter at a time before its square is cut (docs/dev/02 §2.14): the cropper
 * shows the turn, the canvas draws it, and the crop lives in the turned picture's pixels, so what
 * the dialog shows is what gets uploaded.
 */

const landscape: ImageSize = { width: 4000, height: 3000 };

describe('turned', () => {
	it('counts quarter turns clockwise and wraps both ways', () => {
		expect(turned(0, 'right')).toBe(1);
		expect(turned(3, 'right')).toBe(0);
		expect(turned(0, 'left')).toBe(3);
		expect(turned(1, 'left')).toBe(0);
	});
});

describe('turnedSize', () => {
	it('swaps the sides on a quarter or three-quarter turn only', () => {
		expect(turnedSize(landscape, 0)).toEqual({ width: 4000, height: 3000 });
		expect(turnedSize(landscape, 1)).toEqual({ width: 3000, height: 4000 });
		expect(turnedSize(landscape, 2)).toEqual({ width: 4000, height: 3000 });
		expect(turnedSize(landscape, 3)).toEqual({ width: 3000, height: 4000 });
	});
});

/** Where the canvas transform of `turnPlan` puts a picture pixel. */
function draw(plan: ReturnType<typeof turnPlan>, x: number, y: number) {
	const cos = Math.round(Math.cos(plan.angle));
	const sin = Math.round(Math.sin(plan.angle));
	return { x: plan.dx + cos * x - sin * y, y: plan.dy + sin * x + cos * y };
}

describe('turnPlan', () => {
	it('draws the picture into a canvas of the turned size, every corner inside it', () => {
		for (const turns of [0, 1, 2, 3] as const) {
			const plan = turnPlan(landscape, turns);
			expect(plan.canvas).toEqual(turnedSize(landscape, turns));
			for (const [x, y] of [
				[0, 0],
				[4000, 0],
				[0, 3000],
				[4000, 3000]
			]) {
				const at = draw(plan, x, y);
				expect(at.x).toBeGreaterThanOrEqual(0);
				expect(at.x).toBeLessThanOrEqual(plan.canvas.width);
				expect(at.y).toBeGreaterThanOrEqual(0);
				expect(at.y).toBeLessThanOrEqual(plan.canvas.height);
			}
		}
	});

	it('turns clockwise: the top-left corner lands top-right after a right turn, bottom-left after a left one', () => {
		expect(draw(turnPlan(landscape, 1), 0, 0)).toEqual({ x: 3000, y: 0 });
		expect(draw(turnPlan(landscape, 2), 0, 0)).toEqual({ x: 4000, y: 3000 });
		expect(draw(turnPlan(landscape, 3), 0, 0)).toEqual({ x: 0, y: 4000 });
	});
});

describe('turnCrop', () => {
	it('keeps the same part of the picture in the window when it turns', () => {
		// A square in the top-left of the landscape.
		const before = { centerX: 1000, centerY: 1000, zoom: 1.5 };
		const right = turnCrop(landscape, before, 'right');
		// Turned right, that corner is the top-right of the portrait 3000 × 4000.
		expect(right).toEqual({ centerX: 2000, centerY: 1000, zoom: 1.5 });
		const left = turnCrop(landscape, before, 'left');
		expect(left).toEqual({ centerX: 1000, centerY: 3000, zoom: 1.5 });
		// Back and forth is where it started.
		expect(turnCrop(turnedSize(landscape, 1), right, 'left')).toEqual(before);
	});

	it('keeps the centred square centred', () => {
		const turnedRight = turnCrop(landscape, initialCrop(landscape), 'right');
		expect(cropRect(turnedSize(landscape, 1), turnedRight)).toEqual({ x: 0, y: 500, size: 3000 });
	});
});

describe('turnStyle', () => {
	it('draws the unturned picture centred on where the turned one is placed, then turns it', () => {
		const placement = { left: -50, top: 10, width: 300, height: 400 };
		expect(turnStyle(placement, 0)).toEqual({ ...placement, transform: 'none' });
		expect(turnStyle(placement, 1)).toEqual({
			left: -100,
			top: 60,
			width: 400,
			height: 300,
			transform: 'rotate(90deg)'
		});
		expect(turnStyle(placement, 2)).toEqual({ ...placement, transform: 'rotate(180deg)' });
		expect(turnStyle(placement, 3).transform).toBe('rotate(270deg)');
	});
});
