import { describe, expect, it } from 'bun:test';
import { rolesTowards } from './tree-roles';
import type { GraphEdge, GraphModel, GraphNode } from './types';

/*
 * Who everybody on the family tree is to the person it is centred on (docs/05 §5.8): written
 * under each name instead of a name on every line. Read off the links the map already carries —
 * an entered tie from its far end, a worked-out relative by the kinship engine's term.
 */

const person = (id: string, wording?: GraphNode['wording']): GraphNode => ({
	id,
	kind: 'person',
	label: id,
	...(wording ? { wording } : {})
});

const tie = (
	source: string,
	target: string,
	typeKey: string,
	category: GraphEdge['category'] = 'family'
): GraphEdge => ({
	id: `${source}-${typeKey}-${target}`,
	source,
	target,
	kind: 'relationship',
	category,
	typeKey,
	label: typeKey
});

const kin = (
	source: string,
	target: string,
	term: NonNullable<GraphEdge['kin']>['term'],
	variant: NonNullable<GraphEdge['kin']>['variant']
): GraphEdge => ({
	id: `kin:${source}:${target}`,
	source,
	target,
	kind: 'kinship',
	kin: { term, variant },
	derived: true
});

describe('rolesTowards', () => {
	it('names an entered tie from its far end: the parent of the centre is a parent', () => {
		const graph: GraphModel = {
			nodes: [person('lena'), person('markus', 'male'), person('mia', 'female')],
			edges: [tie('markus', 'lena', 'parent_child'), tie('lena', 'mia', 'parent_child')]
		};

		const roles = rolesTowards(graph, 'lena');

		expect(roles.get('markus')).toEqual({ term: 'parent', variant: 'male' });
		expect(roles.get('mia')).toEqual({ term: 'child', variant: 'female' });
	});

	it('takes a worked-out relative’s term as it stands when the relative is its source', () => {
		const graph: GraphModel = {
			nodes: [person('lena'), person('otto', 'male')],
			edges: [kin('otto', 'lena', 'grandparent', 'male')]
		};

		expect(rolesTowards(graph, 'lena').get('otto')).toEqual({
			term: 'grandparent',
			variant: 'male'
		});
	});

	it('reads a worked-out line from the other end, worded by the relative’s own gender', () => {
		// The line was drawn from Otto's side: Lena is his granddaughter. Seen from Lena, Otto is
		// her grandfather — the kinship engine's term turned round, and his wording, not hers.
		const graph: GraphModel = {
			nodes: [person('lena'), person('otto', 'male')],
			edges: [kin('lena', 'otto', 'grandchild', 'female')]
		};

		expect(rolesTowards(graph, 'lena').get('otto')).toEqual({
			term: 'grandparent',
			variant: 'male'
		});
	});

	it('says nothing gendered for somebody whose gender is not on record', () => {
		const graph: GraphModel = {
			nodes: [person('lena'), person('sam')],
			edges: [tie('lena', 'sam', 'sibling')]
		};

		expect(rolesTowards(graph, 'lena').get('sam')).toEqual({
			term: 'sibling',
			variant: 'neutral'
		});
	});

	it('prefers a family tie over another tie to the same person', () => {
		const graph: GraphModel = {
			nodes: [person('lena'), person('jan', 'male')],
			edges: [
				tie('lena', 'jan', 'colleague', 'professional'),
				tie('lena', 'jan', 'cousin', 'family')
			]
		};

		expect(rolesTowards(graph, 'lena').get('jan')?.term).toBe('cousin');
	});

	it('gives no role to somebody tied to the centre only through others, nor to a circle', () => {
		const graph: GraphModel = {
			nodes: [
				person('lena'),
				person('markus'),
				person('eva'),
				{ id: 'ski', kind: 'circle', label: 'Ski' }
			],
			edges: [
				tie('markus', 'lena', 'parent_child'),
				tie('markus', 'eva', 'colleague', 'professional'),
				{ id: 'm', source: 'ski', target: 'lena', kind: 'membership' }
			]
		};

		const roles = rolesTowards(graph, 'lena');

		expect(roles.get('markus')?.term).toBe('parent');
		expect(roles.has('eva')).toBe(false);
		expect(roles.has('ski')).toBe(false);
		expect(roles.has('lena')).toBe(false);
	});

	it('names no role for a type the household made up, which has no noun to say', () => {
		const graph: GraphModel = {
			nodes: [person('lena'), person('gerd')],
			edges: [
				tie('gerd', 'lena', 'godparent_of', 'social'),
				tie('gerd', 'lena', 'friend', 'social')
			]
		};

		// The made-up type is passed over; the friendship, which has a noun, is said.
		expect(rolesTowards(graph, 'lena').get('gerd')?.term).toBe('friend');
	});
});
