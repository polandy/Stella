import { describe, expect, it } from 'bun:test';
import { circleClustersLayout, CLUSTER_SPACING } from './circle-clusters';
import type { Point } from './geometry';
import type { GraphEdge, GraphModel, GraphNode } from '../model/types';

/*
 * The arrangement by circles (docs/02 §2.7, docs/05 §5.8): each circle with its members
 * around it, the circles apart from each other, and everyone in no circle set to one side.
 */

const person = (id: string): GraphNode => ({ id, kind: 'person', label: id });
const circle = (id: string): GraphNode => ({ id, kind: 'circle', label: id });
const member = (circleId: string, personId: string): GraphEdge => ({
	id: `${circleId}-${personId}`,
	source: circleId,
	target: personId,
	kind: 'membership'
});

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** A ski club of three and a choir of two; Carl sings and skis, Ida is in neither. */
const clubs: GraphModel = {
	nodes: [circle('ski'), circle('choir'), ...['anna', 'bert', 'carl', 'dora', 'ida'].map(person)],
	edges: [
		member('ski', 'anna'),
		member('ski', 'bert'),
		member('ski', 'carl'),
		member('choir', 'carl'),
		member('choir', 'dora'),
		{ id: 'f', source: 'anna', target: 'ida', kind: 'relationship', category: 'social' }
	]
};

describe('circleClustersLayout', () => {
	it('gives every node on the map a place', () => {
		const layout = circleClustersLayout(clubs);

		expect([...layout.keys()].sort()).toEqual(clubs.nodes.map((n) => n.id).sort());
	});

	it('rings each circle with its members', () => {
		const layout = circleClustersLayout(clubs);
		const ring = (c: string, p: string) => distance(layout.get(c)!, layout.get(p)!);

		expect(ring('ski', 'anna')).toBeCloseTo(ring('ski', 'bert'));
		expect(ring('ski', 'anna')).toBeGreaterThanOrEqual(CLUSTER_SPACING.node);
		expect(ring('choir', 'dora')).toBeGreaterThanOrEqual(CLUSTER_SPACING.node);
	});

	it('sets someone in two circles with the bigger one', () => {
		const layout = circleClustersLayout(clubs);
		const ring = (c: string, p: string) => distance(layout.get(c)!, layout.get(p)!);

		expect(ring('ski', 'carl')).toBeCloseTo(ring('ski', 'anna'));
	});

	it('keeps the circles apart, so no two groups run into each other', () => {
		const layout = circleClustersLayout(clubs);
		const skiReach = distance(layout.get('ski')!, layout.get('anna')!);
		const choirReach = distance(layout.get('choir')!, layout.get('dora')!);

		expect(distance(layout.get('ski')!, layout.get('choir')!)).toBeGreaterThanOrEqual(
			skiReach + choirReach + CLUSTER_SPACING.node
		);
	});

	it('sets people in no circle apart from every group', () => {
		const layout = circleClustersLayout(clubs);
		const ida = layout.get('ida')!;

		for (const id of ['ski', 'choir', 'anna', 'bert', 'carl', 'dora']) {
			expect(distance(ida, layout.get(id)!)).toBeGreaterThanOrEqual(CLUSTER_SPACING.node);
		}
	});

	it('never puts two nodes closer than a node spacing', () => {
		const many: GraphModel = {
			nodes: [circle('big'), ...Array.from({ length: 14 }, (_, i) => person(`p${i}`))],
			edges: Array.from({ length: 14 }, (_, i) => member('big', `p${i}`))
		};
		const points = [...circleClustersLayout(many).values()];

		for (let i = 0; i < points.length; i++) {
			for (let j = i + 1; j < points.length; j++) {
				expect(distance(points[i], points[j])).toBeGreaterThanOrEqual(CLUSTER_SPACING.node - 1e-9);
			}
		}
	});
});
