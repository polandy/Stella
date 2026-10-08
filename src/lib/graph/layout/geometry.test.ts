import { describe, expect, it } from 'bun:test';
import { bowsAround, shelve, spreadCoincident, type Point, type Size } from './geometry';

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

	it('balances its rows rather than leave one straggler on the last', () => {
		// Four fit on a row; five on rows of four and one would leave one alone beneath.
		const ids = ['a', 'b', 'c', 'd', 'e'];
		const shelf = shelve(ids, { x: 0, y: 0 }, 4 * 60 + 3 * 20, () => box(60), 20, 80);
		const rows = new Map<number, string[]>();
		for (const id of ids) rows.set(shelf.get(id)!.y, [...(rows.get(shelf.get(id)!.y) ?? []), id]);

		expect([...rows.values()].map((row) => row.length)).toEqual([3, 2]);
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

describe('spreadCoincident', () => {
	const origin = { x: 0, y: 0 };

	it('sets everyone sharing one spot apart, a spacing from each other at least', () => {
		const spread = spreadCoincident(
			new Map(['a', 'b', 'c', 'd', 'e'].map((id) => [id, origin])),
			90
		);
		const at = [...spread.values()];

		for (let i = 0; i < at.length; i++) {
			for (let j = i + 1; j < at.length; j++) {
				expect(Math.hypot(at[i].x - at[j].x, at[i].y - at[j].y)).toBeGreaterThanOrEqual(90);
			}
		}
	});

	it('leaves whoever stands alone where they are', () => {
		const spread = spreadCoincident(
			new Map([
				['a', origin],
				['b', origin],
				['alone', { x: 500, y: 300 }]
			]),
			90
		);

		expect(spread.get('alone')).toEqual({ x: 500, y: 300 });
	});

	it('gives each person the same spot however the map was handed over', () => {
		const ids = ['mia', 'elias', 'beat', 'sandra'];
		const forwards = spreadCoincident(new Map(ids.map((id) => [id, origin])), 90);
		const backwards = spreadCoincident(new Map([...ids].reverse().map((id) => [id, origin])), 90);

		for (const id of ids) expect(backwards.get(id), id).toEqual(forwards.get(id)!);
	});
});
