import { describe, expect, it } from 'bun:test';
import { textOf } from '$lib/i18n/linked';
import { createTranslator } from '$lib/i18n/translate';
import type { KinshipGraph } from '$lib/kinship/kinship';
import { L1, L2, L3, likelyCoParent, type CoParentGraph } from './links';
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

const reviewed = (subjectId: string): Trigger => ({ kind: 'person-reviewed', subjectId });

const household = (): Trigger => ({ kind: 'household-reviewed' });

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
		// Both facts the claim rests on, and the person being offered is named in it.
		expect(textOf(found[0]!.reason(createTranslator('en')))).toBe(
			'Bettina is a parent of Hans, and Hans and Lisa are siblings.'
		);
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
		expect(textOf(found[0]!.reason(createTranslator('en')))).toBe(
			'Bettina is a parent of Hans, and Hans and Lisa are siblings.'
		);
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

/*
 * The review trigger (docs/concepts/relationship-suggestions.md §6.5). The rules are the same
 * ones; what changes is how many links they are pointed at — one, or every link the subject
 * stands in. This is the whole reason a suggestion outlives the instant it was written.
 */
describe('a person-scoped review runs the same rules over the links already there', () => {
	const family = () =>
		view({
			parentEdges: [
				{ parentId: 'bettina', childId: 'hans' },
				{ parentId: 'bettina', childId: 'lisa' }
			],
			siblingEdges: [{ a: 'hans', b: 'nina' }]
		});

	it('reaches through a parent link the subject stands in, years after it was entered', () => {
		// Only Bettina/Nina is news; the other two are the stored links read back, and the
		// engine drops them. A rule says what follows and leaves the filtering alone.
		expect(shape(L1(reviewed('hans'), family()))).toEqual([
			['L1', 'parent', 'bettina', 'nina'],
			['L1', 'parent', 'bettina', 'lisa'],
			['L1', 'parent', 'bettina', 'hans']
		]);
	});

	/*
	 * The case a scope of "the subject's own links" would miss entirely, and the reason the
	 * sibling group is the unit: nothing Nina stands in mentions Bettina at all.
	 */
	it('reaches a parent the subject has no link of their own to', () => {
		// Bettina/Lisa comes along because Lisa is a sibling of Nina's sibling; it is already
		// stored, so the engine's suppressions drop it before anyone sees it.
		expect(shape(L1(reviewed('nina'), family()))).toEqual([
			['L1', 'parent', 'bettina', 'nina'],
			['L1', 'parent', 'bettina', 'lisa']
		]);
	});

	it('reaches through a sibling link the subject stands in', () => {
		expect(shape(L2(reviewed('nina'), family()))).toEqual([['L2', 'parent', 'bettina', 'nina']]);
	});

	it('says nothing about someone who stands in no primary link', () => {
		expect(L1(reviewed('kurt'), family())).toEqual([]);
		expect(L2(reviewed('kurt'), family())).toEqual([]);
	});
});

/*
 * The household pass (docs/concepts/relationship-suggestions.md §6.6). Same rules again —
 * what changes is the scope: every primary link in the graph rather than the ones around one
 * person. It is the only scope that reaches a family nobody has thought to open.
 */
describe('a household-wide pass runs the same rules over every link there is', () => {
	/** Two families that share nobody: the Meiers, and the Freis two profiles away. */
	const twoFamilies = () =>
		view({
			people: [
				p('bettina', 'Bettina'),
				p('hans', 'Hans'),
				p('lisa', 'Lisa'),
				p('walter', 'Walter'),
				p('jan', 'Jan'),
				p('nora', 'Nora')
			],
			parentEdges: [
				{ parentId: 'bettina', childId: 'hans' },
				{ parentId: 'walter', childId: 'jan' }
			],
			siblingEdges: [
				{ a: 'hans', b: 'lisa' },
				{ a: 'jan', b: 'nora' }
			]
		});

	/*
	 * Neither family mentions anyone in the other, so no person-scoped review reaches both: a
	 * member would have to open a profile in each, which is exactly what nobody does.
	 */
	it('reaches claims in families that share no one', () => {
		expect(shape(L1(household(), twoFamilies()))).toEqual([
			['L1', 'parent', 'bettina', 'lisa'],
			['L1', 'parent', 'walter', 'nora']
		]);
		expect(shape(L2(household(), twoFamilies()))).toEqual([
			['L2', 'parent', 'bettina', 'lisa'],
			['L2', 'parent', 'walter', 'nora']
		]);
	});

	it('says nothing when no primary link is stored at all', () => {
		expect(L1(household(), view())).toEqual([]);
		expect(L2(household(), view())).toEqual([]);
	});
});

/*
 * L3 — the likely second parent (docs/concepts/relationship-suggestions.md §3.2). Not a
 * logical consequence, so it is a pure question of its own before it is a rule: the form asks
 * it while a parent is picked but not stored yet (multi-pick-relationships D4), and the engine
 * asks it once the link is stored.
 */
describe('likelyCoParent — the chosen parent’s one current partner', () => {
	const graph = (over: Partial<CoParentGraph> = {}): CoParentGraph => ({
		people: [
			{ id: 'anna', birthDate: '1985-02-01' },
			{ id: 'bert', birthDate: '1984-07-09' },
			{ id: 'lio', birthDate: '2015-05-20' }
		],
		parentEdges: [],
		partnerEdges: [{ a: 'anna', b: 'bert' }],
		...over
	});

	it('offers the partner when the parent has exactly one that still holds', () => {
		expect(likelyCoParent(graph(), 'anna', 'lio')).toBe('bert');
	});

	it('reads the partnership from either end', () => {
		expect(likelyCoParent(graph({ partnerEdges: [{ a: 'bert', b: 'anna' }] }), 'anna', 'lio')).toBe(
			'bert'
		);
	});

	it('offers nobody when the parent has no partner', () => {
		expect(likelyCoParent(graph({ partnerEdges: [] }), 'anna', 'lio')).toBeNull();
	});

	// The concept's own L3b: with two partners Stella has no basis to pick one.
	it('offers nobody when the parent has several current partners', () => {
		const partnerEdges = [
			{ a: 'anna', b: 'bert' },
			{ a: 'anna', b: 'carl' }
		];
		expect(likelyCoParent(graph({ partnerEdges }), 'anna', 'lio')).toBeNull();
	});

	it('does not count a partnership that is over', () => {
		expect(
			likelyCoParent(
				graph({ partnerEdges: [{ a: 'anna', b: 'bert', former: true }] }),
				'anna',
				'lio'
			)
		).toBeNull();
		const partnerEdges = [
			{ a: 'anna', b: 'carl', former: true },
			{ a: 'anna', b: 'bert' }
		];
		expect(likelyCoParent(graph({ partnerEdges }), 'anna', 'lio')).toBe('bert');
	});

	it('counts partner and spouse links to the same person once', () => {
		const partnerEdges = [
			{ a: 'anna', b: 'bert' },
			{ a: 'bert', b: 'anna' }
		];
		expect(likelyCoParent(graph({ partnerEdges }), 'anna', 'lio')).toBe('bert');
	});

	describe('the step-parent check: a partnership that began after the child was born', () => {
		const since = (sinceDate: string | null) =>
			graph({ partnerEdges: [{ a: 'anna', b: 'bert', sinceDate }] });

		it('offers nobody when the partnership began after the birth', () => {
			expect(likelyCoParent(since('2019-04-01'), 'anna', 'lio')).toBeNull();
		});

		it('offers the partner when it began before the birth, or on the day', () => {
			expect(likelyCoParent(since('2010-08-14'), 'anna', 'lio')).toBe('bert');
			expect(likelyCoParent(since('2015-05-20'), 'anna', 'lio')).toBe('bert');
		});

		it('offers the partner when either date is missing', () => {
			expect(likelyCoParent(since(null), 'anna', 'lio')).toBe('bert');
			const noBirth = graph({
				people: [{ id: 'lio', birthDate: null }],
				partnerEdges: [{ a: 'anna', b: 'bert', sinceDate: '2019-04-01' }]
			});
			expect(likelyCoParent(noBirth, 'anna', 'lio')).toBe('bert');
		});

		it('compares a partial date only as far as both dates go', () => {
			// A later year is later, whatever the day.
			expect(likelyCoParent(since('2016'), 'anna', 'lio')).toBeNull();
			expect(likelyCoParent(since('2015-06'), 'anna', 'lio')).toBeNull();
			// The same year, or the same month, cannot say which came first.
			expect(likelyCoParent(since('2015'), 'anna', 'lio')).toBe('bert');
			expect(likelyCoParent(since('2015-05'), 'anna', 'lio')).toBe('bert');
		});

		it('cannot tell from a day without a year', () => {
			expect(likelyCoParent(since('--06-01'), 'anna', 'lio')).toBe('bert');
		});
	});

	describe('a free parent slot', () => {
		it('offers nobody when the child has two parents besides the chosen one', () => {
			const parentEdges = [
				{ parentId: 'carl', childId: 'lio' },
				{ parentId: 'dora', childId: 'lio' }
			];
			expect(likelyCoParent(graph({ parentEdges }), 'anna', 'lio')).toBeNull();
		});

		// The chosen parent counts whether stored already (the engine) or only picked (the form).
		it('counts the chosen parent as one of the two', () => {
			const picked = graph({ parentEdges: [{ parentId: 'carl', childId: 'lio' }] });
			expect(likelyCoParent(picked, 'anna', 'lio')).toBeNull();
			const stored = graph({
				parentEdges: [
					{ parentId: 'anna', childId: 'lio' },
					{ parentId: 'carl', childId: 'lio' }
				]
			});
			expect(likelyCoParent(stored, 'anna', 'lio')).toBeNull();
		});

		it('offers the partner when the chosen parent is the only one on record', () => {
			expect(
				likelyCoParent(
					graph({ parentEdges: [{ parentId: 'anna', childId: 'lio' }] }),
					'anna',
					'lio'
				)
			).toBe('bert');
		});
	});

	it('offers nobody when the partner already is a parent of the child', () => {
		expect(
			likelyCoParent(graph({ parentEdges: [{ parentId: 'bert', childId: 'lio' }] }), 'anna', 'lio')
		).toBeNull();
	});

	// A partner recorded as the child's own child, or who is the child, is nobody's offer.
	it('offers nobody the generation guard would refuse, nor the child themself', () => {
		expect(
			likelyCoParent(graph({ parentEdges: [{ parentId: 'lio', childId: 'bert' }] }), 'anna', 'lio')
		).toBeNull();
		expect(
			likelyCoParent(graph({ partnerEdges: [{ a: 'anna', b: 'lio' }] }), 'anna', 'lio')
		).toBeNull();
	});
});

describe('L3 — a parent stored from the parent’s side offers their partner', () => {
	const family = (over: Partial<KinshipGraph> = {}) =>
		view({
			people: [p('anna', 'Anna'), p('bert', 'Bert'), p('lio', 'Lio'), p('mia', 'Mia')],
			parentEdges: [{ parentId: 'anna', childId: 'lio' }],
			partnerEdges: [{ a: 'anna', b: 'bert' }],
			...over
		});
	const storedFrom = (enteredFrom: string): Trigger => ({
		kind: 'link-stored',
		link: { kind: 'parent', fromId: 'anna', toId: 'lio' },
		enteredFrom
	});

	it('offers the partner as the child’s other parent, as likely, with both facts in the reason', () => {
		const found = L3(storedFrom('anna'), family());
		expect(shape(found)).toEqual([['L3', 'parent', 'bert', 'lio']]);
		expect(found[0]!.confidence).toBe('likely');
		expect(textOf(found[0]!.reason(createTranslator('en')))).toBe(
			'Bert and Anna are partners, and Anna is a parent of Lio.'
		);
		expect(textOf(found[0]!.reason(createTranslator('de')))).toBe(
			'Bert und Anna sind ein Paar, und Anna ist ein Elternteil von Lio.'
		);
	});

	// The form on the child's page offered the partner already (D4); asking twice is nagging.
	it('stays quiet when the link was entered on the child’s page', () => {
		expect(L3(storedFrom('lio'), family())).toEqual([]);
	});

	it('says nothing when the parent has no single current partner', () => {
		expect(L3(storedFrom('anna'), family({ partnerEdges: [] }))).toEqual([]);
	});

	it('answers only a stored parent link, never a review', () => {
		const v = family({ siblingEdges: [{ a: 'lio', b: 'mia' }] });
		expect(
			L3({ kind: 'link-stored', link: { kind: 'sibling', fromId: 'lio', toId: 'mia' } }, v)
		).toEqual([]);
		expect(L3(reviewed('lio'), v)).toEqual([]);
		expect(L3(household(), v)).toEqual([]);
	});
});
