import { describe, expect, it } from 'bun:test';
import { segmentsOf } from './segments';
import type { Point } from '../layout/geometry';

/*
 * A routed line handed to Cytoscape (docs/05 §5.8). Cytoscape places each bend of a `segments`
 * edge by a weight along the line between the two node centres and a distance off it, to the
 * left-hand normal (-dy, dx) of that line — so the bends worked out in model units have to be
 * said that way, and must come back out exactly where they were worked out.
 */

/** Where Cytoscape puts a bend, by its own formula (`findSegmentsPoints`). */
function placed(source: Point, target: Point, weight: number, distance: number): Point {
	const length = Math.hypot(target.x - source.x, target.y - source.y);
	const normal = { x: -(target.y - source.y) / length, y: (target.x - source.x) / length };
	return {
		x: source.x * (1 - weight) + target.x * weight + normal.x * distance,
		y: source.y * (1 - weight) + target.y * weight + normal.y * distance
	};
}

describe('segmentsOf', () => {
	const parent = { x: 100, y: 0 };
	const child = { x: 300, y: 170 };
	const waypoints = [
		{ x: 50, y: 93.5 },
		{ x: 300, y: 93.5 }
	];

	it('says every bend so that Cytoscape draws it where it was worked out', () => {
		const { weights, distances } = segmentsOf({ waypoints, nameEnd: null }, parent, child);

		expect(weights).toHaveLength(2);
		waypoints.forEach((point, i) => {
			const at = placed(parent, child, weights[i], distances[i]);
			expect(at.x).toBeCloseTo(point.x, 9);
			expect(at.y).toBeCloseTo(point.y, 9);
		});
	});

	it('works the same for a line travelled upwards or straight across', () => {
		for (const [from, to] of [
			[child, parent],
			[
				{ x: 0, y: 0 },
				{ x: 300, y: 0 }
			]
		]) {
			const { weights, distances } = segmentsOf({ waypoints, nameEnd: null }, from, to);
			waypoints.forEach((point, i) => {
				const at = placed(from, to, weights[i], distances[i]);
				expect(at.x).toBeCloseTo(point.x, 9);
				expect(at.y).toBeCloseTo(point.y, 9);
			});
		}
	});

	it('leaves a line from the middle of a partner bar there, not from the parent', () => {
		const route = { waypoints, sourceEnd: { x: 50, y: 0 }, nameEnd: null };

		expect(segmentsOf(route, parent, child).sourceEndpoint).toBe('-50px 0px');
	});

	it('starts a line below the name of the person it leaves downwards, and ends on the disc', () => {
		const { sourceEndpoint, targetEndpoint } = segmentsOf(
			{ waypoints, nameEnd: null },
			parent,
			child
		);

		expect(sourceEndpoint).toBe('outside-to-node-or-label');
		expect(targetEndpoint).toBe('outside-to-node');
		// Travelled upwards, the name under the person it reaches is the one to stop short of.
		const upwards = segmentsOf(
			{ waypoints: [...waypoints].reverse(), nameEnd: null },
			child,
			parent
		);
		expect(upwards.sourceEndpoint).toBe('outside-to-node');
		expect(upwards.targetEndpoint).toBe('outside-to-node-or-label');
	});
});
