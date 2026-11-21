import { describe, expect, it } from 'bun:test';
import {
	auntUncleSlots,
	isParentSlot,
	missingParentSlots,
	SLOT_DIAMETER,
	slotLine,
	slotPlaces,
	slotsShown
} from './missing-parents';
import type { GraphEdge, GraphModel, GraphNode } from './types';

/*
 * Where the family tree around a person offers a parent nobody entered (docs/dev/02 §2.7,
 * docs/dev/05 §5.8): only up the centre's own line, three generations deep.
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
const linkOf = (a: string, typeKey: string, b: string): GraphEdge => ({
	id: `${a}-${typeKey}-${b}`,
	source: a,
	target: b,
	kind: 'relationship',
	category: 'family',
	typeKey
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

describe('slotPlaces', () => {
	const slots = [
		{ id: 'slot:parent-of:lena', childId: 'lena' },
		{ id: 'slot:parent-of:jan', childId: 'jan' }
	];

	it('stands a slot just over its child, clear of the top of their disc', () => {
		const places = slotPlaces(slots, new Map([['lena', { x: 120, y: 460 }]]), () => 40);

		const plus = places.get('slot:parent-of:lena')!;
		expect(plus.x).toBe(120);
		expect(plus.y).toBeLessThan(460 - 20 - SLOT_DIAMETER / 2);
		expect(plus.y).toBeGreaterThan(460 - 230 / 2);
	});

	it('places no slot whose child has no place', () => {
		expect(
			slotPlaces(slots, new Map([['lena', { x: 0, y: 0 }]]), () => 30).has('slot:parent-of:jan')
		).toBe(false);
	});
});

describe('slotsShown', () => {
	const slots = [
		{ id: 'slot:parent-of:lena', childId: 'lena' },
		{ id: 'slot:parent-of:jan', childId: 'jan' }
	];

	it('shows only the slot over somebody selected', () => {
		expect(
			slotsShown(slots, { gaps: false, selected: new Set(['jan']) }).map((s) => s.childId)
		).toEqual(['jan']);
		expect(slotsShown(slots, { gaps: false, selected: new Set() })).toEqual([]);
	});

	it('shows every slot while the gaps are asked for', () => {
		expect(slotsShown(slots, { gaps: true, selected: new Set() })).toHaveLength(2);
	});
});

describe('isParentSlot', () => {
	it('tells a slot from a person by its id', () => {
		expect(isParentSlot('slot:parent-of:lena')).toBe(true);
		expect(isParentSlot('lena')).toBe(false);
	});
});

describe('auntUncleSlots', () => {
	// Sia's cousins were entered straight onto her; nobody entered the aunt or uncle between.
	const ids = ['kekly', 'sia', 'andy', 'lacky', 'hoat'];
	const edges = [
		parentOf('kekly', 'sia'),
		linkOf('andy', 'spouse', 'sia'),
		linkOf('lacky', 'cousin', 'sia'),
		linkOf('hoat', 'cousin', 'sia')
	];

	it('offers one aunt or uncle over the cousins of one person who have no parent on record', () => {
		const tree = model(ids, edges);

		expect(auntUncleSlots(tree, tree)).toEqual([
			{ id: 'slot:aunt-uncle-of:sia', childId: 'lacky', relatives: ['lacky', 'hoat'] }
		]);
	});

	it('offers none for a cousin whose parent is on record, even off the map', () => {
		const graph = model([...ids, 'mai'], [...edges, parentOf('mai', 'lacky')]);
		const onMap = model(ids, edges);

		expect(auntUncleSlots(graph, onMap)[0]?.relatives).toEqual(['hoat']);
	});

	it('reads no gap where the parents are past what the page holds', () => {
		const tree = model(ids, edges);

		expect(auntUncleSlots(tree, tree, () => false)).toEqual([]);
	});

	it('offers none for an in-law standing loose: no aunt or uncle is missing there', () => {
		const tree = model(
			['kekly', 'sia', 'tom'],
			[parentOf('kekly', 'sia'), linkOf('tom', 'sibling_in_law', 'sia')]
		);

		expect(auntUncleSlots(tree, tree)).toEqual([]);
	});

	it('is tied in by no line, and stands over the middle of its cousins', () => {
		const [slot] = auntUncleSlots(model(ids, edges), model(ids, edges));
		const places = new Map([
			['lacky', { x: 100, y: 300 }],
			['hoat', { x: 200, y: 300 }]
		]);

		expect(slotLine(slot!)).toBeUndefined();
		const plus = slotPlaces([slot!], places, () => 40).get(slot!.id)!;
		expect(plus.x).toBe(150);
		expect(plus.y).toBeLessThan(300 - 20);
	});

	it('shows over any one of its cousins selected, and is a slot by its id', () => {
		const [slot] = auntUncleSlots(model(ids, edges), model(ids, edges));

		expect(slotsShown([slot!], { gaps: false, selected: new Set(['hoat']) })).toHaveLength(1);
		expect(slotsShown([slot!], { gaps: false, selected: new Set(['sia']) })).toEqual([]);
		expect(isParentSlot(slot!.id)).toBe(true);
	});
});
