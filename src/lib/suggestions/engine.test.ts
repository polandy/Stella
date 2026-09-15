import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import type { KinshipGraph } from '$lib/kinship/kinship';
import { pairKey, type Dismissal } from './claims';
import { evaluate, oneRowPerClaim } from './engine';
import type { Suggestion, Trigger } from './types';
import { buildView } from './view';

/*
 * The engine (docs/concepts/relationship-suggestions.md §6): it selects the rules that answer
 * the trigger, applies the universal suppressions to all of their output at once, and orders
 * what is left deterministically.
 *
 * The suppressions have their own suite; what is asserted here is that they are applied at
 * all, and that two rules naming one claim produce one row rather than two.
 */

const p = (id: string, displayName = id) => ({ id, displayName, gender: null });

function view(over: Partial<KinshipGraph> = {}, dismissals: Dismissal[] = []) {
	return buildView(
		{
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
		},
		dismissals
	);
}

const stored = (kind: 'parent' | 'sibling' | 'partner', fromId: string, toId: string): Trigger => ({
	kind: 'link-stored',
	link: { kind, fromId, toId }
});

/** Suggestions as `[ruleId, relation, from, to]`, ignoring the sentence. */
const shape = (trigger: Trigger, v: ReturnType<typeof view>) =>
	evaluate(trigger, v).map((s) => [s.ruleId, s.relation, s.fromId, s.toId]);

describe('evaluate', () => {
	it('runs the rule that answers the trigger and phrases what it found', () => {
		const v = view({
			parentEdges: [{ parentId: 'bettina', childId: 'hans' }],
			siblingEdges: [{ a: 'hans', b: 'lisa' }]
		});
		const found = evaluate(stored('parent', 'bettina', 'hans'), v);
		expect(shape(stored('parent', 'bettina', 'hans'), v)).toEqual([
			['L1', 'parent', 'bettina', 'lisa']
		]);
		expect(found[0]?.reason(createTranslator('de'))).toBe('Lisa ist ein Geschwisterteil von Hans.');
	});

	/*
	 * A partner link implies nothing storable — the tie to existing children is a step
	 * relationship the profile already names. Asserted against the full result for a trigger
	 * that *does* produce suggestions from the same graph, so an engine that silently returned
	 * nothing at all could not pass this (-implementation.md §8).
	 */
	it('offers nothing for a stored partner link, while the same graph still answers a parent link', () => {
		const v = view({
			parentEdges: [{ parentId: 'bettina', childId: 'hans' }],
			siblingEdges: [{ a: 'hans', b: 'lisa' }],
			partnerEdges: [{ a: 'bettina', b: 'kurt' }]
		});
		expect(shape(stored('partner', 'bettina', 'kurt'), v)).toEqual([]);
		expect(shape(stored('parent', 'bettina', 'hans'), v)).toEqual([
			['L1', 'parent', 'bettina', 'lisa']
		]);
	});

	describe('suppressions', () => {
		it('drops a claim the household has already entered as a parent link', () => {
			const v = view({
				parentEdges: [
					{ parentId: 'bettina', childId: 'hans' },
					{ parentId: 'bettina', childId: 'lisa' }
				],
				siblingEdges: [{ a: 'hans', b: 'lisa' }]
			});
			expect(shape(stored('parent', 'bettina', 'hans'), v)).toEqual([]);
		});

		it('drops a claim for a pair the household linked some other way', () => {
			const v = view({
				parentEdges: [{ parentId: 'bettina', childId: 'hans' }],
				siblingEdges: [{ a: 'hans', b: 'lisa' }],
				storedPairs: [{ a: 'bettina', b: 'lisa' }]
			});
			expect(shape(stored('parent', 'bettina', 'hans'), v)).toEqual([]);
		});

		it('drops a claim naming someone the view was not given', () => {
			const v = buildView({
				// Lisa is Hans's sibling, but is not someone this viewer may see.
				people: [p('bettina', 'Bettina'), p('hans', 'Hans')],
				parentEdges: [{ parentId: 'bettina', childId: 'hans' }],
				siblingEdges: [{ a: 'hans', b: 'lisa' }],
				partnerEdges: [],
				storedPairs: []
			});
			expect(shape(stored('parent', 'bettina', 'hans'), v)).toEqual([]);
		});

		it('never offers a person as their own relative', () => {
			const v = view({
				parentEdges: [{ parentId: 'bettina', childId: 'hans' }],
				siblingEdges: [{ a: 'hans', b: 'bettina' }]
			});
			expect(shape(stored('parent', 'bettina', 'hans'), v)).toEqual([]);
		});
	});

	/*
	 * The dismissal log (docs/concepts/relationship-suggestions.md §6.4). A *no* that is not
	 * remembered is re-asked on the next run, which the on-demand review would make unbearable.
	 */
	describe('dismissal', () => {
		const declined = () =>
			view(
				{
					parentEdges: [{ parentId: 'bettina', childId: 'hans' }],
					siblingEdges: [
						{ a: 'hans', b: 'lisa' },
						{ a: 'hans', b: 'nina' }
					]
				},
				[
					{
						relation: 'parent',
						pairKey: pairKey('bettina', 'lisa'),
						dismissedAt: 42,
						dismissedBy: 'u1'
					}
				]
			);

		it('drops a claim the household declined, and keeps the rest of the run', () => {
			expect(shape(stored('parent', 'bettina', 'hans'), declined())).toEqual([
				['L1', 'parent', 'bettina', 'nina']
			]);
		});

		it('answers a different claim over the same pair', () => {
			const v = view(
				{ siblingEdges: [{ a: 'hans', b: 'lisa' }], parentEdges: [{ parentId: 'bettina', childId: 'hans' }] },
				[
					{
						relation: 'sibling',
						pairKey: pairKey('bettina', 'lisa'),
						dismissedAt: 42,
						dismissedBy: 'u1'
					}
				]
			);
			expect(shape(stored('parent', 'bettina', 'hans'), v)).toEqual([
				['L1', 'parent', 'bettina', 'lisa']
			]);
		});

		it('lists a declined claim when asked for it, marked with when it was declined', () => {
			const found = evaluate(stored('parent', 'bettina', 'hans'), declined(), {
				includeDismissed: true
			});
			expect(found.map((s) => [s.toId, s.dismissed?.at ?? null])).toEqual([
				['lisa', 42],
				['nina', null]
			]);
		});

		it('keeps the other suppressions hard drops even when declined claims are asked for', () => {
			const v = view(
				{
					parentEdges: [
						{ parentId: 'bettina', childId: 'hans' },
						{ parentId: 'bettina', childId: 'lisa' }
					],
					siblingEdges: [{ a: 'hans', b: 'lisa' }]
				},
				[]
			);
			expect(evaluate(stored('parent', 'bettina', 'hans'), v, { includeDismissed: true })).toEqual(
				[]
			);
		});
	});

	/*
	 * The on-demand review (docs/concepts/relationship-suggestions.md §6.5): the same rules,
	 * pointed at a person instead of at a write, so a claim outlives the moment it was raised.
	 */
	describe('a person-scoped review', () => {
		const family = () =>
			view({
				parentEdges: [{ parentId: 'bettina', childId: 'hans' }],
				siblingEdges: [{ a: 'hans', b: 'lisa' }]
			});

		it('answers a claim standing around someone, with nothing newly written', () => {
			expect(shape({ kind: 'person-reviewed', subjectId: 'lisa' }, family())).toEqual([
				['L1', 'parent', 'bettina', 'lisa']
			]);
		});

		it('offers one row for a claim two rules both reach', () => {
			expect(shape({ kind: 'person-reviewed', subjectId: 'hans' }, family())).toEqual([
				['L1', 'parent', 'bettina', 'lisa']
			]);
		});

		it('says nothing about someone standing in no link at all', () => {
			expect(shape({ kind: 'person-reviewed', subjectId: 'kurt' }, family())).toEqual([]);
		});
	});

	describe('ordering', () => {
		it('orders by the people named, so the list is the same every run', () => {
			const v = view({
				parentEdges: [{ parentId: 'bettina', childId: 'hans' }],
				siblingEdges: [
					{ a: 'hans', b: 'nina' },
					{ a: 'hans', b: 'lisa' }
				]
			});
			expect(shape(stored('parent', 'bettina', 'hans'), v)).toEqual([
				['L1', 'parent', 'bettina', 'lisa'],
				['L1', 'parent', 'bettina', 'nina']
			]);
		});

	});

	/*
	 * Also tested on its own, not only through the review above: a case built through
	 * `evaluate` alone leans on which rules happen to be registered for a trigger, and would
	 * go quietly green again the day that changes. Here the two rules naming one claim are
	 * handed in directly, so deleting the de-duplication turns this red on its own.
	 */
	describe('oneRowPerClaim', () => {
		const claim = (ruleId: 'L1' | 'L2', fromId: string, toId: string): Suggestion => ({
			kind: 'link',
			ruleId,
			confidence: 'certain',
			relation: 'parent',
			fromId,
			toId,
			reason: () => ruleId,
			dismissed: null
		});

		it('keeps the first of two rules naming the same claim', () => {
			const found = oneRowPerClaim([
				claim('L1', 'bettina', 'lisa'),
				claim('L2', 'bettina', 'lisa')
			]);
			expect(found.map((s) => s.ruleId)).toEqual(['L1']);
		});

		it('treats a pair named from either end as the same claim', () => {
			const found = oneRowPerClaim([
				claim('L1', 'bettina', 'lisa'),
				claim('L2', 'lisa', 'bettina')
			]);
			expect(found.map((s) => s.ruleId)).toEqual(['L1']);
		});

		it('keeps claims that name different pairs', () => {
			const found = oneRowPerClaim([
				claim('L1', 'bettina', 'lisa'),
				claim('L1', 'bettina', 'nina')
			]);
			expect(found.map((s) => s.toId)).toEqual(['lisa', 'nina']);
		});
	});
});
