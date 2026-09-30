import { describe, expect, it } from 'bun:test';
import { impliedKinshipEdgeIds } from './implied-kinship';
import type { GraphEdge, GraphModel } from './types';

const person = (id: string) => ({ id, kind: 'person' as const, label: id });
const link = (id: string, source: string, target: string, typeKey: string): GraphEdge => ({
	id,
	source,
	target,
	kind: 'relationship',
	category: 'family',
	typeKey
});
const kin = (id: string, source: string, target: string): GraphEdge => ({
	id,
	source,
	target,
	kind: 'kinship',
	derived: true
});

/** Steve and Andy are siblings; Frederick is Steve's son, so Andy's nephew. */
const nephew: GraphModel = {
	nodes: ['steve', 'andy', 'frederick'].map(person),
	edges: [
		link('sib', 'steve', 'andy', 'sibling'),
		link('child', 'steve', 'frederick', 'parent_child'),
		kin('kin-nephew', 'andy', 'frederick')
	]
};

describe('impliedKinshipEdgeIds', () => {
	it('names a derived line whose chain of entered links is on the map', () => {
		expect(impliedKinshipEdgeIds(nephew)).toEqual(new Set(['kin-nephew']));
	});

	it('keeps the derived lines of the selected person, at either end', () => {
		expect(impliedKinshipEdgeIds(nephew, 'andy')).toEqual(new Set());
		expect(impliedKinshipEdgeIds(nephew, 'frederick')).toEqual(new Set());
		expect(impliedKinshipEdgeIds(nephew, 'steve')).toEqual(new Set(['kin-nephew']));
	});

	it('keeps a derived line whose chain is missing a person, because it is the only bridge', () => {
		const withoutSteve: GraphModel = {
			nodes: ['andy', 'frederick'].map(person),
			edges: [kin('kin-nephew', 'andy', 'frederick')]
		};

		expect(impliedKinshipEdgeIds(withoutSteve)).toEqual(new Set());
	});

	it('keeps a derived line whose chain runs through a link filtered off the map', () => {
		const siblingHidden: GraphModel = {
			nodes: nephew.nodes,
			edges: nephew.edges.filter((e) => e.id !== 'sib')
		};

		expect(impliedKinshipEdgeIds(siblingHidden)).toEqual(new Set());
	});

	it('does not count a chain through a friend or a circle as family', () => {
		const viaFriend: GraphModel = {
			nodes: [...['andy', 'kim', 'frederick'].map(person), { id: 'club', kind: 'circle', label: 'Club' }],
			edges: [
				{ ...link('friend', 'andy', 'kim', 'friend'), category: 'social' },
				{ id: 'm1', source: 'club', target: 'kim', kind: 'membership' },
				{ id: 'm2', source: 'club', target: 'frederick', kind: 'membership' },
				kin('kin-nephew', 'andy', 'frederick')
			]
		};

		expect(impliedKinshipEdgeIds(viaFriend)).toEqual(new Set());
	});

	it('does not lean on another derived line to make the chain', () => {
		// Andy and Steve are siblings only by inference here; their shared mother is off the map.
		const derivedSibling: GraphModel = {
			nodes: nephew.nodes,
			edges: [
				kin('kin-sib', 'steve', 'andy'),
				link('child', 'steve', 'frederick', 'parent_child'),
				kin('kin-nephew', 'andy', 'frederick')
			]
		};

		expect(impliedKinshipEdgeIds(derivedSibling)).toEqual(new Set());
	});

	it('follows siblings through a shared parent when their own link was never entered', () => {
		const throughMother: GraphModel = {
			nodes: ['mother', 'steve', 'andy', 'frederick'].map(person),
			edges: [
				link('m-steve', 'mother', 'steve', 'parent_child'),
				link('m-andy', 'mother', 'andy', 'parent_child'),
				link('child', 'steve', 'frederick', 'parent_child'),
				kin('kin-sib', 'steve', 'andy'),
				kin('kin-nephew', 'andy', 'frederick'),
				kin('kin-grandson', 'mother', 'frederick')
			]
		};

		expect(impliedKinshipEdgeIds(throughMother)).toEqual(
			new Set(['kin-sib', 'kin-nephew', 'kin-grandson'])
		);
	});

	it('reaches a cousin through both grandparents’ generation — four links away', () => {
		const cousins: GraphModel = {
			nodes: ['grandma', 'steve', 'andy', 'frederick', 'leonardo'].map(person),
			edges: [
				link('g-steve', 'grandma', 'steve', 'parent_child'),
				link('g-andy', 'grandma', 'andy', 'parent_child'),
				link('s-fred', 'steve', 'frederick', 'parent_child'),
				link('a-leo', 'andy', 'leonardo', 'parent_child'),
				kin('kin-cousin', 'frederick', 'leonardo')
			]
		};

		expect(impliedKinshipEdgeIds(cousins).has('kin-cousin')).toBe(true);
	});

	it('counts partners as family, so a step-parent needs no line of their own', () => {
		const stepFamily: GraphModel = {
			nodes: ['mother', 'stepdad', 'child'].map(person),
			edges: [
				{ ...link('p', 'mother', 'stepdad', 'spouse'), category: 'romantic' },
				link('mc', 'mother', 'child', 'parent_child'),
				kin('kin-step', 'stepdad', 'child')
			]
		};

		expect(impliedKinshipEdgeIds(stepFamily)).toEqual(new Set(['kin-step']));
	});

	it('gives up on a chain longer than any relative Stella works out', () => {
		// Five links apart: a chain the reader can no longer follow by eye, so the line stays.
		const far: GraphModel = {
			nodes: ['a', 'b', 'c', 'd', 'e', 'f'].map(person),
			edges: [
				link('1', 'a', 'b', 'sibling'),
				link('2', 'b', 'c', 'sibling'),
				link('3', 'c', 'd', 'sibling'),
				link('4', 'd', 'e', 'sibling'),
				link('5', 'e', 'f', 'sibling'),
				kin('kin-far', 'a', 'f')
			]
		};

		expect(impliedKinshipEdgeIds(far)).toEqual(new Set());
	});
});
