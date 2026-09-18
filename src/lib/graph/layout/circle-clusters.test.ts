import { describe, expect, it } from 'bun:test';
import { circleClustersLayout } from './circle-clusters';
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
		const layout = circleClustersLayout(clubs).positions;

		expect([...layout.keys()].sort()).toEqual(clubs.nodes.map((n) => n.id).sort());
	});

	it('rings each circle with its members', () => {
		const layout = circleClustersLayout(clubs).positions;
		const ring = (c: string, p: string) => distance(layout.get(c)!, layout.get(p)!);

		expect(ring('ski', 'anna')).toBeCloseTo(ring('ski', 'bert'));
		expect(ring('ski', 'anna')).toBeGreaterThan(0);
		expect(ring('choir', 'dora')).toBeGreaterThan(0);
	});

	it('sets someone in two circles with the bigger one', () => {
		const layout = circleClustersLayout(clubs).positions;
		const ring = (c: string, p: string) => distance(layout.get(c)!, layout.get(p)!);

		expect(ring('ski', 'carl')).toBeCloseTo(ring('ski', 'anna'));
	});

	it('keeps the groups apart, and nobody on the map on top of anybody else', () => {
		// Circles are drawn as wide name tags; a person is a small node with a name under it.
		const sizeOf = (id: string) =>
			clubs.nodes.find((n) => n.id === id)!.kind === 'circle'
				? { width: 260, height: 40 }
				: { width: 110, height: 70 };
		const layout = circleClustersLayout(clubs, sizeOf).positions;
		const ids = [...layout.keys()];

		for (let i = 0; i < ids.length; i++) {
			for (let j = i + 1; j < ids.length; j++) {
				const [a, b] = [layout.get(ids[i])!, layout.get(ids[j])!];
				const [sa, sb] = [sizeOf(ids[i]), sizeOf(ids[j])];
				const apartX = Math.abs(a.x - b.x) >= (sa.width + sb.width) / 2;
				const apartY = Math.abs(a.y - b.y) >= (sa.height + sb.height) / 2;
				expect(apartX || apartY, `${ids[i]} and ${ids[j]}`).toBe(true);
			}
		}
	});
});
