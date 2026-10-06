import { describe, expect, it } from 'bun:test';
import { circleClustersLayout } from './circle-clusters';
import type { Point } from './geometry';
import { groupByRole } from '../model/role-groups';
import type { GraphEdge, GraphModel, GraphNode } from '../model/types';

/*
 * The arrangement by circles (docs/02 §2.7, docs/05 §5.8): each circle with its members
 * around it, the circles apart from each other, and everyone in no circle set to one side.
 */

const person = (id: string): GraphNode => ({ id, kind: 'person', label: id });
const circle = (id: string): GraphNode => ({ id, kind: 'circle', label: id });
const member = (circleId: string, personId: string, role?: string): GraphEdge => ({
	id: `${circleId}-${personId}`,
	source: circleId,
	target: personId,
	kind: 'membership',
	...(role ? { label: role } : {})
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

	describe('with the circles grouped by role', () => {
		/** A class of four children and three parents, and a coach who stands alone. */
		const school: GraphModel = {
			nodes: [
				circle('class'),
				...['c1', 'c2', 'c3', 'c4', 'p1', 'p2', 'p3', 'coach', 'ida'].map(person)
			],
			edges: [
				...['c1', 'c2', 'c3', 'c4'].map((c) => member('class', c, 'Child')),
				...['p1', 'p2', 'p3'].map((p) => member('class', p, 'Parent')),
				member('class', 'coach', 'Coach')
			]
		};
		const grouping = groupByRole(school, { innerLinks: true });
		const sizeOf = (id: string) =>
			id === 'class' ? { width: 260, height: 40 } : { width: 110, height: 70 };
		const layout = circleClustersLayout(school, sizeOf, grouping).positions;
		const centroid = (ids: string[]) => ({
			x: ids.reduce((sum, id) => sum + layout.get(id)!.x, 0) / ids.length,
			y: ids.reduce((sum, id) => sum + layout.get(id)!.y, 0) / ids.length
		});

		it('stands each group together as one block, not strung out along the ring', () => {
			for (const group of grouping.groups) {
				const centre = centroid(group.memberIds);
				for (const id of group.memberIds) {
					// Within a node's width of the block's centre: a 2×2 block, not a quarter ring.
					expect(distance(layout.get(id)!, centre), id).toBeLessThan(110);
				}
			}
		});

		it('keeps every group clear of the circle, of the other groups and of whoever stands alone', () => {
			// A frame reaches past its members by its padding and the name on top.
			const box = (ids: string[]) => {
				const xs = ids.flatMap((id) => [layout.get(id)!.x - 55, layout.get(id)!.x + 55]);
				const ys = ids.flatMap((id) => [layout.get(id)!.y - 35, layout.get(id)!.y + 35]);
				return {
					x1: Math.min(...xs) - 16,
					x2: Math.max(...xs) + 16,
					y1: Math.min(...ys) - 40,
					y2: Math.max(...ys) + 16
				};
			};
			const around = (id: string) => {
				const at = layout.get(id)!;
				const size = sizeOf(id);
				return {
					x1: at.x - size.width / 2,
					x2: at.x + size.width / 2,
					y1: at.y - size.height / 2,
					y2: at.y + size.height / 2
				};
			};
			const boxes = [
				...grouping.groups.map((g) => box(g.memberIds)),
				around('class'),
				around('coach')
			];
			for (let i = 0; i < boxes.length; i++) {
				for (let j = i + 1; j < boxes.length; j++) {
					const [a, b] = [boxes[i], boxes[j]];
					const apart = a.x2 <= b.x1 || b.x2 <= a.x1 || a.y2 <= b.y1 || b.y2 <= a.y1;
					expect(apart, `box ${i} and box ${j}`).toBe(true);
				}
			}
		});
	});
});
