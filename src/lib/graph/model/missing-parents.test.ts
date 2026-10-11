import { describe, expect, it } from 'bun:test';
import { isParentSlot, missingParentSlots, withParentSlots } from './missing-parents';
import type { GraphEdge, GraphModel, GraphNode } from './types';

/*
 * Where the family tree around a person offers a parent nobody entered (docs/02 §2.7,
 * docs/05 §5.8): only up the centre's own line, three generations deep.
 */

const person = (id: string): GraphNode => ({ id, kind: 'person', label: id });
const parentOf = (parent: string, child: string): GraphEdge => ({
	id: `${parent}-parent_child-${child}`,
	source: parent,
	target: child,
	kind: 'relationship',
	category: 'family',
	typeKey: 'parent_child'
});
const friendOf = (a: string, b: string): GraphEdge => ({
	id: `${a}-friend-${b}`,
	source: a,
	target: b,
	kind: 'relationship',
	category: 'social',
	typeKey: 'friend'
});
const model = (ids: string[], edges: GraphEdge[]): GraphModel => ({
	nodes: ids.map(person),
	edges
});

describe('missingParentSlots', () => {
	it('offers one slot over a centre nobody entered a parent for', () => {
		const graph = model(['lena', 'nicole'], [friendOf('lena', 'nicole')]);

		expect(missingParentSlots(graph, graph, 'lena')).toEqual([
			{ id: 'slot:parent-of:lena', childId: 'lena' }
		]);
	});

	it('offers the other parent beside the one on record', () => {
		const graph = model(['lena', 'peter'], [parentOf('peter', 'lena')]);

		const slots = missingParentSlots(graph, graph, 'lena');

		expect(slots).toContainEqual({
			id: 'slot:parent-of:lena',
			childId: 'lena',
			besideParentId: 'peter'
		});
	});

	it('walks up the line: a parent on the map gets slots of their own', () => {
		const graph = model(
			['lena', 'peter', 'maria'],
			[parentOf('peter', 'lena'), parentOf('maria', 'lena')]
		);

		const children = missingParentSlots(graph, graph, 'lena').map((s) => s.childId);

		expect(children.sort()).toEqual(['maria', 'peter']);
	});

	it('stops at the grandparents, so a long line does not fill the top with slots', () => {
		const ids = ['lena', 'peter', 'georg', 'otto', 'karl'];
		const graph = model(ids, [
			parentOf('peter', 'lena'),
			parentOf('georg', 'peter'),
			parentOf('otto', 'georg'),
			parentOf('karl', 'otto')
		]);

		const children = missingParentSlots(graph, graph, 'lena').map((s) => s.childId);

		expect(children).toEqual(['lena', 'peter', 'georg']);
	});

	it('offers nothing where a parent exists but is not opened up on the map yet', () => {
		const graph = model(['lena', 'peter', 'maria'], [parentOf('peter', 'lena')]);
		const onMap = model(['lena', 'maria'], []);

		expect(missingParentSlots(graph, onMap, 'lena')).toEqual([]);
	});

	it('leaves aunts, cousins and friends alone: only the centre’s own line', () => {
		const graph = model(
			['lena', 'peter', 'maria', 'nicole'],
			[parentOf('peter', 'lena'), parentOf('maria', 'lena'), friendOf('lena', 'nicole')]
		);

		const children = missingParentSlots(graph, graph, 'lena').map((s) => s.childId);

		expect(children).not.toContain('nicole');
	});

	it('offers nothing for somebody whose parents the map was not handed', () => {
		// A person's page carries two hops: a grandparent's own parents are past its edge.
		const graph = model(['lena', 'peter'], [parentOf('peter', 'lena')]);

		const slots = missingParentSlots(graph, graph, 'lena', (id) => id !== 'peter');

		expect(slots.map((s) => s.childId)).toEqual(['lena']);
	});

	it('offers nothing around a circle', () => {
		const graph: GraphModel = { nodes: [{ id: 'kegel', kind: 'circle', label: 'K' }], edges: [] };

		expect(missingParentSlots(graph, graph, 'kegel')).toEqual([]);
	});
});

describe('withParentSlots', () => {
	it('stands a slot in as a parent, and beside the one parent as their partner', () => {
		const graph = model(['lena', 'peter'], [parentOf('peter', 'lena')]);
		const slots = missingParentSlots(graph, graph, 'lena');

		const laidOut = withParentSlots(graph, slots);
		const slotId = 'slot:parent-of:lena';

		expect(laidOut.nodes.map((n) => n.id)).toContain(slotId);
		expect(laidOut.edges).toContainEqual(
			expect.objectContaining({ source: slotId, target: 'lena', typeKey: 'parent_child' })
		);
		expect(laidOut.edges).toContainEqual(
			expect.objectContaining({ source: slotId, target: 'peter', typeKey: 'partner' })
		);
	});

	it('tells a slot from a person by its id', () => {
		expect(isParentSlot('slot:parent-of:lena')).toBe(true);
		expect(isParentSlot('lena')).toBe(false);
	});
});
