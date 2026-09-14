import { describe, expect, it } from 'bun:test';
import type { KinshipGraph } from '$lib/kinship/kinship';
import { buildView, pairKey } from './view';

/*
 * The read model the rules and suppressions work over (docs/concepts/relationship-
 * suggestions-implementation.md §2). It is built once per evaluation: every rule asks it
 * questions rather than walking the edge lists itself, so "who are Hans's siblings" is
 * answered the same way wherever it is asked.
 */

const p = (id: string, displayName = id) => ({ id, displayName, gender: null });

function graph(over: Partial<KinshipGraph> = {}): KinshipGraph {
	return {
		people: [p('bettina', 'Bettina'), p('kurt', 'Kurt'), p('hans', 'Hans'), p('lisa', 'Lisa')],
		parentEdges: [],
		siblingEdges: [],
		partnerEdges: [],
		storedPairs: [],
		...over
	};
}

const sorted = (ids: Iterable<string>) => [...ids].sort();

describe('pairKey', () => {
	it('names a pair the same way from either end', () => {
		expect(pairKey('hans', 'lisa')).toBe(pairKey('lisa', 'hans'));
	});

	it('tells different pairs apart', () => {
		expect(pairKey('hans', 'lisa')).not.toBe(pairKey('hans', 'kurt'));
	});
});

describe('buildView', () => {
	it('indexes parents and children in both directions', () => {
		const view = buildView(
			graph({
				parentEdges: [
					{ parentId: 'bettina', childId: 'hans' },
					{ parentId: 'kurt', childId: 'hans' }
				]
			})
		);
		expect(sorted(view.parentsOf('hans'))).toEqual(['bettina', 'kurt']);
		expect(sorted(view.childrenOf('bettina'))).toEqual(['hans']);
		expect(sorted(view.parentsOf('bettina'))).toEqual([]);
	});

	it('reads an entered sibling link from both ends', () => {
		const view = buildView(graph({ siblingEdges: [{ a: 'hans', b: 'lisa' }] }));
		expect(sorted(view.siblingsOf('hans'))).toEqual(['lisa']);
		expect(sorted(view.siblingsOf('lisa'))).toEqual(['hans']);
	});

	it('treats people sharing a parent as siblings without an entered link', () => {
		const view = buildView(
			graph({
				parentEdges: [
					{ parentId: 'kurt', childId: 'hans' },
					{ parentId: 'kurt', childId: 'lisa' }
				]
			})
		);
		expect(sorted(view.siblingsOf('hans'))).toEqual(['lisa']);
	});

	it('never makes a person their own sibling', () => {
		const view = buildView(
			graph({
				parentEdges: [{ parentId: 'kurt', childId: 'hans' }],
				siblingEdges: [{ a: 'hans', b: 'hans' }]
			})
		);
		expect(sorted(view.siblingsOf('hans'))).toEqual([]);
	});

	it('knows every pair the household has already linked, in any form', () => {
		const view = buildView(
			graph({
				parentEdges: [{ parentId: 'bettina', childId: 'hans' }],
				siblingEdges: [{ a: 'hans', b: 'lisa' }],
				partnerEdges: [{ a: 'bettina', b: 'kurt' }],
				storedPairs: [{ a: 'kurt', b: 'lisa' }]
			})
		);
		expect(view.isLinked('hans', 'bettina')).toBe(true);
		expect(view.isLinked('lisa', 'hans')).toBe(true);
		expect(view.isLinked('kurt', 'bettina')).toBe(true);
		expect(view.isLinked('lisa', 'kurt')).toBe(true);
		expect(view.isLinked('bettina', 'lisa')).toBe(false);
	});

	it('names a person, and falls back to the id for someone it was not given', () => {
		const view = buildView(graph());
		expect(view.nameOf('bettina')).toBe('Bettina');
		expect(view.nameOf('nobody')).toBe('nobody');
	});

	it('knows which people it may name at all', () => {
		const view = buildView(graph());
		expect(view.has('hans')).toBe(true);
		expect(view.has('nobody')).toBe(false);
	});
});
