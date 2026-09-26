import { describe, expect, it } from 'bun:test';
import { groupBlock, packGroups } from './group-blocks';
import type { Point } from './geometry';

/*
 * A group by role as one block (docs/02 §2.7): its members in rows as near square as they go,
 * inside a frame with its name on top — wherever the arrangement set the group down.
 */

const size = () => ({ width: 110, height: 70 });

describe('groupBlock', () => {
	it('sets the members in rows as near square as they go, around the centre', () => {
		const { offsets } = groupBlock(['a', 'b', 'c', 'd'], size);
		const xs = new Set(offsets.map((o) => o.x));
		const ys = new Set(offsets.map((o) => o.y));

		expect([xs.size, ys.size]).toEqual([2, 2]);
		expect(offsets.reduce((sum, o) => sum + o.x, 0)).toBeCloseTo(0);
	});

	it('keeps every member clear of the others', () => {
		const { offsets } = groupBlock(['a', 'b', 'c', 'd', 'e'], size);

		for (let i = 0; i < offsets.length; i++) {
			for (let j = i + 1; j < offsets.length; j++) {
				const apartX = Math.abs(offsets[i].x - offsets[j].x) >= 110;
				const apartY = Math.abs(offsets[i].y - offsets[j].y) >= 70;
				expect(apartX || apartY).toBe(true);
			}
		}
	});
});

describe('packGroups', () => {
	const scattered = new Map<string, Point>([
		['a', { x: 0, y: 0 }],
		['b', { x: 600, y: 0 }],
		['c', { x: 0, y: 600 }],
		['d', { x: 600, y: 600 }],
		['loner', { x: 1000, y: 1000 }]
	]);

	it('gathers a scattered group into one block where it stood', () => {
		const packed = packGroups(scattered, [['a', 'b', 'c', 'd']], size);

		for (const id of ['a', 'b', 'c', 'd']) {
			const at = packed.get(id)!;
			// Within a node's width of where the group stood: a 2×2 block, not a 600-wide scatter.
			expect(Math.hypot(at.x - 300, at.y - 300), id).toBeLessThan(120);
		}
	});

	it('leaves everyone outside a group where they are', () => {
		const packed = packGroups(scattered, [['a', 'b', 'c', 'd']], size);

		expect(packed.get('loner')).toEqual({ x: 1000, y: 1000 });
	});
});
