import { describe, expect, it } from 'bun:test';
import { bridgesOf, drawnLine } from './tree-bridges';

/*
 * Where a line of the family tree crosses another's bar, the bar gets a gap the crossing line
 * runs through (docs/dev/05 §5.8).
 */

const line = (id: string, ...points: [number, number][]) => ({
	id,
	points: points.map(([x, y]) => ({ x, y }))
});

describe('bridgesOf', () => {
	it('bridges an upright piece crossing another line’s bar inside both', () => {
		const bar = line('bar', [0, 0], [0, 100], [200, 100], [200, 200]);
		const drop = line('drop', [100, 0], [100, 150], [50, 150], [50, 200]);
		expect(bridgesOf([bar, drop])).toEqual([{ at: { x: 100, y: 100 }, over: ['drop'] }]);
	});

	it('sees no crossing where one line meets another at a corner or an end', () => {
		const bar = line('bar', [0, 0], [0, 100], [200, 100], [200, 200]);
		const joining = line('joining', [0, 0], [0, 100], [100, 100], [100, 200]);
		expect(bridgesOf([bar, joining])).toEqual([]);
	});

	it('bridges once for the lines sharing one upright, naming each', () => {
		const bar = line('bar', [0, 0], [0, 100], [200, 100], [200, 200]);
		const a = line('a', [100, 0], [100, 150], [50, 150], [50, 200]);
		const b = line('b', [100, 0], [100, 150], [30, 150], [30, 200]);
		expect(bridgesOf([bar, a, b])).toEqual([{ at: { x: 100, y: 100 }, over: ['a', 'b'] }]);
	});

	it('reads a routed line from where it leaves its source to where it docks', () => {
		const drawn = drawnLine(
			'l',
			{ waypoints: [{ x: 0, y: 50 }], nameEnd: null, targetEnd: { x: 0, y: 90 } },
			{ x: 0, y: 0 },
			{ x: 6, y: 100 }
		);
		expect(drawn.points).toEqual([
			{ x: 0, y: 0 },
			{ x: 0, y: 50 },
			{ x: 0, y: 90 }
		]);
	});
});
