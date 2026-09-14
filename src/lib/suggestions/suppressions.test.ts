import { describe, expect, it } from 'bun:test';
import type { KinshipGraph } from '$lib/kinship/kinship';
import { deriveKinship } from '$lib/kinship/kinship';
import { isDerivable } from './suppressions';
import { buildView } from './view';

/*
 * The universal suppressions (docs/concepts/relationship-suggestions.md §6.2), tested apart
 * from the rules on purpose: a rule that fires correctly and is then wrongly dropped is
 * invisible in a rule test (-implementation.md §8, §10).
 *
 * `isDerivable` is the load-bearing one. If it over-fires, Stella stops offering links it
 * should offer; if it under-fires, Stella offers to *store* what the kinship engine already
 * works out, and every accepted one permanently replaces a derived label with an entered row.
 * There is no undo for that beyond deleting the link.
 */

const p = (id: string, displayName = id) => ({ id, displayName, gender: null });

function graph(over: Partial<KinshipGraph> = {}): KinshipGraph {
	return {
		people: [
			p('bettina', 'Bettina'),
			p('kurt', 'Kurt'),
			p('hans', 'Hans'),
			p('lisa', 'Lisa'),
			p('lio', 'Lio')
		],
		parentEdges: [],
		siblingEdges: [],
		partnerEdges: [],
		storedPairs: [],
		...over
	};
}

describe('isDerivable', () => {
	it('is true for a sibling pair derivation already calls siblings', () => {
		// Hans and Lisa share both parents, so the kinship engine names them siblings.
		const g = graph({
			parentEdges: [
				{ parentId: 'bettina', childId: 'hans' },
				{ parentId: 'bettina', childId: 'lisa' }
			]
		});
		const view = buildView(g);
		expect(deriveKinship(g, 'hans').map((k) => [k.personId, k.term])).toContainEqual([
			'lisa',
			'sibling'
		]);
		expect(isDerivable(view, 'sibling', 'lisa', 'hans')).toBe(true);
	});

	it('is true for a half-sibling pair — the coarser link would bury the finer name', () => {
		const g = graph({
			parentEdges: [
				{ parentId: 'bettina', childId: 'hans' },
				{ parentId: 'kurt', childId: 'hans' },
				{ parentId: 'bettina', childId: 'lio' },
				{ parentId: 'lisa', childId: 'lio' }
			]
		});
		const view = buildView(g);
		expect(deriveKinship(g, 'hans').map((k) => [k.personId, k.term])).toContainEqual([
			'lio',
			'half-sibling'
		]);
		expect(isDerivable(view, 'sibling', 'lio', 'hans')).toBe(true);
	});

	/*
	 * The case that decides the whole design: derivation calls a partner the *step-parent* of
	 * their partner's child — precisely the pair a rule wants to offer as **parent**. Comparing
	 * pairs would silence that offer forever; comparing relations keeps it.
	 */
	it('is false for a parent offer on a pair derivation only calls step-parent', () => {
		const g = graph({
			parentEdges: [{ parentId: 'bettina', childId: 'hans' }],
			partnerEdges: [{ a: 'bettina', b: 'kurt' }]
		});
		const view = buildView(g);
		expect(deriveKinship(g, 'hans').map((k) => [k.personId, k.term])).toContainEqual([
			'kurt',
			'step-parent'
		]);
		expect(isDerivable(view, 'parent', 'kurt', 'hans')).toBe(false);
	});

	it('is false for a sibling offer on a pair derivation only calls step-siblings', () => {
		const g = graph({
			parentEdges: [
				{ parentId: 'bettina', childId: 'hans' },
				{ parentId: 'kurt', childId: 'lisa' }
			],
			partnerEdges: [{ a: 'bettina', b: 'kurt' }]
		});
		const view = buildView(g);
		expect(deriveKinship(g, 'hans').map((k) => [k.personId, k.term])).toContainEqual([
			'lisa',
			'step-sibling'
		]);
		expect(isDerivable(view, 'sibling', 'lisa', 'hans')).toBe(false);
	});

	it('is false for a pair derivation says nothing about', () => {
		const view = buildView(graph({ parentEdges: [{ parentId: 'bettina', childId: 'hans' }] }));
		expect(isDerivable(view, 'parent', 'kurt', 'lisa')).toBe(false);
		expect(isDerivable(view, 'sibling', 'kurt', 'lisa')).toBe(false);
	});

	/*
	 * Derivation has no term meaning "parent" — a parent is always entered, never worked out.
	 * Stated as a test so that adding one later cannot quietly start silencing parent offers.
	 */
	it('is false for a parent offer on a pair that is already an entered parent link', () => {
		const view = buildView(graph({ parentEdges: [{ parentId: 'bettina', childId: 'hans' }] }));
		expect(isDerivable(view, 'parent', 'bettina', 'hans')).toBe(false);
	});
});
