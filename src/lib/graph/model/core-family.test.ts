import { describe, expect, it } from 'bun:test';
import { coreFamilyOf } from './core-family';
import type { GraphEdge, GraphModel, GraphNode } from './types';

/*
 * Who the family tree frames first (docs/dev/05 §5.8): the centre's parents, grandparents,
 * siblings, partners and children — not the cousins, in-laws, aunts and uncles around them.
 */

const person = (id: string): GraphNode => ({ id, kind: 'person', label: id });

const tie = (source: string, target: string, typeKey: string): GraphEdge => ({
	id: `${source}-${typeKey}-${target}`,
	source,
	target,
	kind: 'relationship',
	category: typeKey === 'spouse' ? 'romantic' : 'family',
	typeKey
});

const cousinLine = (source: string, target: string): GraphEdge => ({
	id: `kin:${source}:${target}`,
	source,
	target,
	kind: 'kinship',
	kin: { term: 'cousin', variant: 'neutral' },
	derived: true
});

const graph = (edges: GraphEdge[]): GraphModel => {
	const ids = new Set(edges.flatMap((e) => [e.source, e.target]));
	return { nodes: [...ids].map(person), edges };
};

describe('coreFamilyOf', () => {
	it('takes the parents, grandparents, siblings, partner and children of the centre', () => {
		const family = graph([
			tie('grandma', 'mum', 'parent_child'),
			tie('mum', 'sia', 'parent_child'),
			tie('dad', 'sia', 'parent_child'),
			tie('mum', 'linda', 'parent_child'),
			tie('sia', 'andy', 'spouse'),
			tie('sia', 'leo', 'parent_child')
		]);

		expect(coreFamilyOf(family, 'sia')).toEqual(
			new Set(['sia', 'grandma', 'mum', 'dad', 'linda', 'andy', 'leo'])
		);
	});

	it('leaves out cousins and in-laws', () => {
		const family = graph([
			tie('mum', 'sia', 'parent_child'),
			cousinLine('lacky', 'sia'),
			tie('sia', 'steve', 'sibling_in_law')
		]);

		expect(coreFamilyOf(family, 'sia')).toEqual(new Set(['sia', 'mum']));
	});

	it('counts an entered sibling with no parents on the map', () => {
		expect(coreFamilyOf(graph([tie('linda', 'sia', 'sibling')]), 'sia')).toEqual(
			new Set(['sia', 'linda'])
		);
	});
});
