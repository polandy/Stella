import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import type { KinshipGraph } from '$lib/kinship/kinship';
import { L1, L2 } from './links';
import type { Trigger } from '../types';
import { buildView } from '../view';

/*
 * The link rules on their own (docs/concepts/relationship-suggestions.md §2, L1 and L2).
 *
 * A rule says what *follows* from a trigger and nothing else: it does not decide whether the
 * claim is already known, already derived, or fit to show. That is the engine's job, and the
 * suppressions have their own suite — so a case here that looks like it should be filtered is
 * expected to come back unfiltered.
 */

const p = (id: string, displayName = id) => ({ id, displayName, gender: null });

function view(over: Partial<KinshipGraph> = {}) {
	return buildView({
		people: [
			p('bettina', 'Bettina'),
			p('kurt', 'Kurt'),
			p('hans', 'Hans'),
			p('lisa', 'Lisa'),
			p('nina', 'Nina')
		],
		parentEdges: [],
		siblingEdges: [],
		partnerEdges: [],
		storedPairs: [],
		...over
	});
}

const stored = (kind: 'parent' | 'sibling' | 'partner', fromId: string, toId: string): Trigger => ({
	kind: 'link-stored',
	link: { kind, fromId, toId }
});

/** Suggestions as `[ruleId, relation, from, to]`, ignoring the sentence. */
const shape = (found: { ruleId: string; relation: string; fromId: string; toId: string }[]) =>
	found.map((s) => [s.ruleId, s.relation, s.fromId, s.toId]);

describe('L1 — a new parent belongs to the child’s siblings too', () => {
	it('offers the parent to every sibling of the child', () => {
		const v = view({
			parentEdges: [{ parentId: 'bettina', childId: 'hans' }],
			siblingEdges: [
				{ a: 'hans', b: 'lisa' },
				{ a: 'hans', b: 'nina' }
			]
		});
		const found = L1(stored('parent', 'bettina', 'hans'), v);
		expect(shape(found)).toEqual([
			['L1', 'parent', 'bettina', 'lisa'],
			['L1', 'parent', 'bettina', 'nina']
		]);
		expect(found.every((s) => s.confidence === 'certain')).toBe(true);
		expect(found[0]?.reason(createTranslator('en'))).toBe('Lisa is Hans’s sibling.');
	});

	it('counts a sibling implied by a shared parent, not only an entered one', () => {
		const v = view({
			parentEdges: [
				{ parentId: 'kurt', childId: 'hans' },
				{ parentId: 'kurt', childId: 'lisa' },
				{ parentId: 'bettina', childId: 'hans' }
			]
		});
		expect(shape(L1(stored('parent', 'bettina', 'hans'), v))).toEqual([
			['L1', 'parent', 'bettina', 'lisa']
		]);
	});

	it('says nothing when the child has no siblings', () => {
		const v = view({ parentEdges: [{ parentId: 'bettina', childId: 'hans' }] });
		expect(L1(stored('parent', 'bettina', 'hans'), v)).toEqual([]);
	});

	it('answers only a stored parent link', () => {
		const v = view({ siblingEdges: [{ a: 'hans', b: 'lisa' }] });
		expect(L1(stored('sibling', 'hans', 'lisa'), v)).toEqual([]);
		expect(L1(stored('partner', 'bettina', 'kurt'), v)).toEqual([]);
	});
});

describe('L2 — new siblings share the parents each side already has', () => {
	it('offers each side’s parents to the other', () => {
		const v = view({
			parentEdges: [
				{ parentId: 'bettina', childId: 'hans' },
				{ parentId: 'kurt', childId: 'lisa' }
			],
			siblingEdges: [{ a: 'hans', b: 'lisa' }]
		});
		const found = L2(stored('sibling', 'hans', 'lisa'), v);
		expect(shape(found)).toEqual([
			['L2', 'parent', 'bettina', 'lisa'],
			['L2', 'parent', 'kurt', 'hans']
		]);
		expect(found[0]?.reason(createTranslator('en'))).toBe('Bettina is Hans’s parent.');
	});

	it('says nothing when neither side has a parent on record', () => {
		const v = view({ siblingEdges: [{ a: 'hans', b: 'lisa' }] });
		expect(L2(stored('sibling', 'hans', 'lisa'), v)).toEqual([]);
	});

	it('answers only a stored sibling link', () => {
		const v = view({ parentEdges: [{ parentId: 'bettina', childId: 'hans' }] });
		expect(L2(stored('parent', 'bettina', 'hans'), v)).toEqual([]);
		expect(L2(stored('partner', 'bettina', 'kurt'), v)).toEqual([]);
	});
});
