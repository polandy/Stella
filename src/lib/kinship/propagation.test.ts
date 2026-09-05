import { describe, expect, it } from 'bun:test';
import type { KinshipGraph } from './kinship';
import { suggestPropagation, type PrimaryLink } from './propagation';

/*
 * Propagation suggestions (docs/02 §2.4.1). Adding one primary link usually implies others
 * the household would otherwise type in by hand. Stella proposes them; it never writes them.
 * The graph passed in already contains the new link — the caller has just stored it.
 */

const p = (id: string) => ({ id, displayName: id, gender: null });

function graph(over: Partial<KinshipGraph> = {}): KinshipGraph {
	return {
		people: [p('Bettina'), p('Kurt'), p('Hans'), p('Lisa'), p('Nina')],
		parentEdges: [],
		siblingEdges: [],
		partnerEdges: [],
		storedPairs: [],
		...over
	};
}

/** Suggestions as `[kind, from, to]`, ignoring the sentence. */
const shape = (graph: KinshipGraph, added: PrimaryLink) =>
	suggestPropagation(graph, added).map((s) => [s.kind, s.fromId, s.toId]);

describe('suggestPropagation', () => {
	it('offers a new parent to the child’s siblings', () => {
		const g = graph({
			parentEdges: [{ parentId: 'Bettina', childId: 'Hans' }],
			siblingEdges: [
				{ a: 'Hans', b: 'Lisa' },
				{ a: 'Hans', b: 'Nina' }
			]
		});
		const found = suggestPropagation(g, { kind: 'parent', fromId: 'Bettina', toId: 'Hans' });
		expect(found.map((s) => [s.kind, s.fromId, s.toId])).toEqual([
			['parent', 'Bettina', 'Lisa'],
			['parent', 'Bettina', 'Nina']
		]);
		expect(found[0]?.reason).toBe('Lisa is Hans’s sibling.');
	});

	it('offers the known parents of each side when a sibling link is added', () => {
		const g = graph({
			parentEdges: [
				{ parentId: 'Bettina', childId: 'Hans' },
				{ parentId: 'Kurt', childId: 'Lisa' }
			],
			siblingEdges: [{ a: 'Hans', b: 'Lisa' }]
		});
		expect(shape(g, { kind: 'sibling', fromId: 'Hans', toId: 'Lisa' })).toEqual([
			['parent', 'Bettina', 'Lisa'],
			['parent', 'Kurt', 'Hans']
		]);
	});

	it('says nothing that is already stored', () => {
		const g = graph({
			parentEdges: [
				{ parentId: 'Bettina', childId: 'Hans' },
				{ parentId: 'Bettina', childId: 'Lisa' }
			],
			siblingEdges: [{ a: 'Hans', b: 'Lisa' }]
		});
		expect(shape(g, { kind: 'parent', fromId: 'Bettina', toId: 'Hans' })).toEqual([]);
	});

	it('respects a pair the household already linked some other way', () => {
		const g = graph({
			parentEdges: [{ parentId: 'Bettina', childId: 'Hans' }],
			siblingEdges: [{ a: 'Hans', b: 'Lisa' }],
			storedPairs: [{ a: 'Bettina', b: 'Lisa' }]
		});
		expect(shape(g, { kind: 'parent', fromId: 'Bettina', toId: 'Hans' })).toEqual([]);
	});

	it('treats people sharing a parent as siblings even without an explicit sibling link', () => {
		const g = graph({
			parentEdges: [
				{ parentId: 'Kurt', childId: 'Hans' },
				{ parentId: 'Kurt', childId: 'Lisa' },
				{ parentId: 'Bettina', childId: 'Hans' }
			]
		});
		expect(shape(g, { kind: 'parent', fromId: 'Bettina', toId: 'Hans' })).toEqual([
			['parent', 'Bettina', 'Lisa']
		]);
	});

	it('proposes nothing for a partner link — a step-relationship is derived, never stored', () => {
		const g = graph({
			parentEdges: [{ parentId: 'Bettina', childId: 'Hans' }],
			partnerEdges: [{ a: 'Bettina', b: 'Kurt' }]
		});
		expect(suggestPropagation(g, { kind: 'partner', fromId: 'Bettina', toId: 'Kurt' })).toEqual([]);
	});

	it('proposes nothing when the new link stands alone', () => {
		const g = graph({ parentEdges: [{ parentId: 'Bettina', childId: 'Hans' }] });
		expect(suggestPropagation(g, { kind: 'parent', fromId: 'Bettina', toId: 'Hans' })).toEqual([]);
	});

	it('never proposes a person as their own relative, and never repeats itself', () => {
		const g = graph({
			parentEdges: [{ parentId: 'Bettina', childId: 'Hans' }],
			siblingEdges: [
				{ a: 'Hans', b: 'Lisa' },
				{ a: 'Lisa', b: 'Hans' }
			]
		});
		const found = shape(g, { kind: 'parent', fromId: 'Bettina', toId: 'Hans' });
		expect(found).toEqual([['parent', 'Bettina', 'Lisa']]);
		expect(found.every(([, from, to]) => from !== to)).toBe(true);
	});
});
