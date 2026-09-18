import { describe, expect, it } from 'bun:test';
import { bowsAround, shelve, type Point, type Size } from './geometry';

/*
 * The shared geometry of the arrangements (docs/05 §5.8): shelving by real width, and bending
 * a line around whoever stands on it, so a label is never hidden under a node and two lines
 * never lie on top of each other.
 */

const box = (width: number, height = 40): Size => ({ width, height });
const small = () => box(40);

describe('shelve', () => {
	it('leaves room for how wide each node really is', () => {
		const widths: Record<string, number> = { choir: 240, anna: 40, bert: 40 };
		const shelf = shelve(
			['choir', 'anna', 'bert'],
			{ x: 0, y: 0 },
			1000,
			(id) => box(widths[id]),
			20,
			80
		);
		const right = (id: string) => shelf.get(id)!.x + widths[id] / 2;
		const left = (id: string) => shelf.get(id)!.x - widths[id] / 2;

		expect(left('anna')).toBeGreaterThanOrEqual(right('choir') + 20);
		expect(left('bert')).toBeGreaterThanOrEqual(right('anna') + 20);
	});

	it('starts a new row before running past the width', () => {
		const shelf = shelve(['a', 'b', 'c'], { x: 0, y: 0 }, 150, () => box(60), 20, 80);

		expect(shelf.get('a')!.y).toBe(shelf.get('b')!.y);
		expect(shelf.get('c')!.y).toBeGreaterThan(shelf.get('a')!.y);
	});
});

describe('bowsAround', () => {
	const line = [{ id: 'e', source: 's', target: 't' }];

	it('leaves a line straight when nobody stands on it', () => {
		const positions = new Map<string, Point>([
			['s', { x: 0, y: 0 }],
			['t', { x: 0, y: 300 }],
			['aside', { x: 200, y: 150 }]
		]);

		expect(bowsAround(positions, line, small, 10).size).toBe(0);
	});

	it('bends a line around a node standing on it, far enough to clear it', () => {
		const positions = new Map<string, Point>([
			['s', { x: 0, y: 0 }],
			['t', { x: 0, y: 300 }],
			['between', { x: 0, y: 150 }]
		]);

		const bow = bowsAround(positions, line, small, 10).get('e')!;

		// A bezier's middle strays half its bow from the straight line.
		expect(Math.abs(bow) / 2).toBeGreaterThanOrEqual(20 + 10);
	});

	it('bends to the side with room', () => {
		// Travelling down the screen, the left-hand normal (-dy, dx) points to negative x; the
		// node stands slightly to that side, so the line bends the other way.
		const positions = new Map<string, Point>([
			['s', { x: 0, y: 0 }],
			['t', { x: 0, y: 300 }],
			['between', { x: -10, y: 150 }]
		]);

		expect(bowsAround(positions, line, small, 10).get('e')!).toBeLessThan(0);
	});

	it('ignores nodes beyond either end of the line', () => {
		const positions = new Map<string, Point>([
			['s', { x: 0, y: 0 }],
			['t', { x: 0, y: 300 }],
			['beyond', { x: 0, y: 400 }]
		]);

		expect(bowsAround(positions, line, small, 10).size).toBe(0);
	});
});
