import { describe, expect, it } from 'bun:test';
import { NAMED_RING_FACES, RING_HEIGHT, namedRing } from './named-ring';

/*
 * The People card's map preview on a phone (docs/05 §5.5): the people entered in a ring round
 * this person, every face with its first name. A card is narrow, so the ring holds at most a
 * handful of faces and folds the rest into one "+N" disc, and no name may run into a face or
 * another name.
 */

interface Box {
	left: number;
	right: number;
	top: number;
	bottom: number;
}
const overlaps = (a: Box, b: Box) =>
	a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

describe('namedRing', () => {
	it('puts this person in the middle of a ring as tall as the card gives it', () => {
		const ring = namedRing(4);
		expect(ring.height).toBe(RING_HEIGHT);
		expect(ring.center.x).toBe(ring.width / 2);
	});

	it('gives every person a face while they fit', () => {
		const ring = namedRing(NAMED_RING_FACES);
		expect(ring.nodes).toHaveLength(NAMED_RING_FACES);
		expect(ring.more).toBeNull();
	});

	it('folds everyone past the last face into a "+N" disc in the last place', () => {
		const ring = namedRing(NAMED_RING_FACES + 5);
		expect(ring.nodes).toHaveLength(NAMED_RING_FACES - 1);
		expect(ring.more).toMatchObject({ count: 6 });
	});

	it('writes a name over a face in the upper half and under one in the lower', () => {
		const ring = namedRing(6);
		for (const node of ring.nodes) {
			if (node.y < ring.center.y) expect(node.labelY).toBeLessThan(node.y);
			else expect(node.labelY).toBeGreaterThan(node.y);
		}
	});

	it('keeps every face and every name inside the picture', () => {
		for (let count = 1; count <= 12; count++) {
			const ring = namedRing(count);
			for (const node of ring.nodes) {
				const { left, right, top, bottom } = ring.labelBox(node);
				expect(left).toBeGreaterThanOrEqual(0);
				expect(right).toBeLessThanOrEqual(ring.width);
				expect(top).toBeGreaterThanOrEqual(0);
				expect(bottom).toBeLessThanOrEqual(ring.height);
				expect(node.y - ring.nodeR).toBeGreaterThanOrEqual(0);
				expect(node.y + ring.nodeR).toBeLessThanOrEqual(ring.height);
			}
		}
	});

	it('never lets a name run into a face, the centre or another name', () => {
		for (let count = 1; count <= 12; count++) {
			const ring = namedRing(count);
			const disc = (x: number, y: number, r: number): Box => ({
				left: x - r,
				right: x + r,
				top: y - r,
				bottom: y + r
			});
			const discs = [
				disc(ring.center.x, ring.center.y, ring.centerR),
				...ring.nodes.map((node) => disc(node.x, node.y, ring.nodeR)),
				...(ring.more ? [disc(ring.more.x, ring.more.y, ring.nodeR)] : [])
			];
			const labels = ring.nodes.map((node) => ring.labelBox(node));
			labels.forEach((label, i) => {
				for (const face of discs) expect(overlaps(label, face)).toBe(false);
				labels.slice(i + 1).forEach((other) => expect(overlaps(label, other)).toBe(false));
			});
		}
	});
});
