import { describe, expect, it } from 'bun:test';
import { laneKey, laneOffsets, type Leg } from './tree-lanes';

/* The lanes the family tree's bars run on (docs/dev/05 §5.8). */

const spacing = { lane: 18, lanes: 4, margin: 8 };

describe('laneOffsets', () => {
	it('sets the outer of two pairs over one child on the lower lane, on either side', () => {
		// Both drops right of the child: the farther pair's bar runs under the nearer one's.
		const near: Leg = { channel: 0, group: 'near', x1: 700, x2: 594 };
		const far: Leg = { channel: 0, group: 'far', x1: 900, x2: 606 };
		const offsets = laneOffsets([near, far], spacing);
		expect(offsets.get(laneKey(far))).toBeLessThan(offsets.get(laneKey(near))!);

		const mirrored = [near, far].map((leg) => ({ ...leg, x1: -leg.x1, x2: -leg.x2 }));
		const back = laneOffsets(mirrored, spacing);
		expect(back.get(laneKey(far))).toBeLessThan(back.get(laneKey(near))!);
	});

	it('keeps the lanes of bars that cross nothing as they are', () => {
		const a: Leg = { channel: 0, group: 'a', x1: 0, x2: 100 };
		const b: Leg = { channel: 0, group: 'b', x1: 50, x2: 300 };
		const offsets = laneOffsets([a, b], spacing);
		expect([offsets.get(laneKey(a)), offsets.get(laneKey(b))]).toEqual([0, 18]);
	});
});
