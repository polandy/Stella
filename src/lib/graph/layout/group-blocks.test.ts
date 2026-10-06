import { describe, expect, it } from 'bun:test';
import { frameAround, groupBlock, packGroups } from './group-blocks';
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

	/** The frame around where `ids` were packed, as the renderer draws it. */
	const frameOf = (packed: Map<string, Point>, ids: string[]) => {
		const { width, height } = size();
		const at = ids.map((id) => packed.get(id)!);
		return frameAround({
			x1: Math.min(...at.map((p) => p.x)) - width / 2,
			y1: Math.min(...at.map((p) => p.y)) - height / 2,
			x2: Math.max(...at.map((p) => p.x)) + width / 2,
			y2: Math.max(...at.map((p) => p.y)) + height / 2
		});
	};
	const covers = (frame: ReturnType<typeof frameAround>, at: Point) => {
		const { width, height } = size();
		return (
			at.x + width / 2 > frame.x1 &&
			at.x - width / 2 < frame.x2 &&
			at.y + height / 2 > frame.y1 &&
			at.y - height / 2 < frame.y2
		);
	};

	it('pushes someone the packing buried under a frame out of it, to just beside it', () => {
		// The circle the free layout happened to set down where the group now stands.
		const buried = new Map(scattered).set('circle', { x: 300, y: 300 });
		const packed = packGroups(buried, [['a', 'b', 'c', 'd']], size);
		const frame = frameOf(packed, ['a', 'b', 'c', 'd']);
		const at = packed.get('circle')!;

		expect(covers(frame, at)).toBe(false);
		// Beside the frame, not flung across the map.
		expect(Math.hypot(at.x - 300, at.y - 300)).toBeLessThan(400);
	});

	it('keeps a pushed person out of a neighbouring frame too', () => {
		const twoGroups = new Map<string, Point>([
			['a', { x: 0, y: 0 }],
			['b', { x: 0, y: 200 }],
			['c', { x: 330, y: 0 }],
			['d', { x: 330, y: 200 }],
			['between', { x: 165, y: 100 }]
		]);
		const packed = packGroups(
			twoGroups,
			[
				['a', 'b'],
				['c', 'd']
			],
			size
		);
		const at = packed.get('between')!;

		expect(covers(frameOf(packed, ['a', 'b']), at)).toBe(false);
		expect(covers(frameOf(packed, ['c', 'd']), at)).toBe(false);
	});
});

describe('frameAround', () => {
	it('reaches past the members by the padding, and higher still by the name on top', () => {
		const members = { x1: 0, y1: 0, x2: 200, y2: 100 };
		const frame = frameAround(members);

		expect(frame.x1).toBeLessThan(members.x1);
		expect(frame.x2).toBeGreaterThan(members.x2);
		expect(frame.y2).toBeGreaterThan(members.y2);
		expect(members.y1 - frame.y1).toBeGreaterThan(frame.y2 - members.y2);
	});
});
