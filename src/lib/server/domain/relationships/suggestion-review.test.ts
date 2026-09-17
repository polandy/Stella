import { describe, expect, it } from 'bun:test';
import { textOf } from '$lib/i18n/linked';
import { createTranslator } from '$lib/i18n/translate';
import type { KinshipGraph } from '$lib/kinship/kinship';
import { pairKey, type Dismissal } from '$lib/suggestions/claims';
import type { Viewer } from '../../access/visibility';
import {
	dismissSuggestion,
	restoreSuggestion,
	reviewHousehold,
	reviewPerson,
	type NewDismissal,
	type SuggestionReviewDeps
} from './suggestion-review';

/*
 * The review and the dismissal log as use-cases (docs/concepts/relationship-suggestions.md
 * §6.4, §6.5). The rules and suppressions have their own suites; what is asserted here is the
 * seam — that the graph is asked for *this viewer*, that a claim about someone the viewer
 * cannot see is refused, and that a declined claim stops being offered and comes back when
 * the *no* is withdrawn.
 */

const viewer: Viewer = { id: 'u1', householdId: 'h1' };
const other: Viewer = { id: 'u2', householdId: 'h2' };

/** Wing Kam is the mother of Andy and Linda; Steve is entered as Andy's sibling. */
function family(): KinshipGraph {
	return {
		people: [
			{ id: 'wingkam', displayName: 'Wing Kam', gender: 'female' },
			{ id: 'andy', displayName: 'Andy', gender: 'male' },
			{ id: 'linda', displayName: 'Linda', gender: 'female' },
			{ id: 'steve', displayName: 'Steve', gender: 'male' }
		],
		parentEdges: [
			{ parentId: 'wingkam', childId: 'andy' },
			{ parentId: 'wingkam', childId: 'linda' }
		],
		siblingEdges: [{ a: 'andy', b: 'steve' }],
		partnerEdges: [],
		storedPairs: []
	};
}

/** Wing Kam as Steve's parent, declined by a member of the household. */
const declinedClaim = (): Dismissal => ({
	relation: 'parent',
	pairKey: pairKey('wingkam', 'steve'),
	dismissedAt: 42,
	dismissedBy: 'u1'
});

function deps(graph: KinshipGraph = family(), log: Dismissal[] = []) {
	const asked: Viewer[] = [];
	const written: NewDismissal[] = [];
	const restored: [Viewer, string, string][] = [];
	const rows = [...log];
	const it: SuggestionReviewDeps & { asked: Viewer[]; written: NewDismissal[]; restored: typeof restored } =
		{
			relationships: {
				async loadKinshipGraphVisibleTo(v) {
					asked.push(v);
					return graph;
				}
			},
			dismissals: {
				async listForHousehold(v) {
					asked.push(v);
					return rows;
				},
				async dismiss(entry) {
					written.push(entry);
					rows.push(entry);
				},
				async restore(v, relation, pair) {
					restored.push([v, relation, pair]);
					const at = rows.findIndex((r) => r.relation === relation && r.pairKey === pair);
					if (at === -1) return false;
					rows.splice(at, 1);
					return true;
				}
			},
			ids: { next: () => 'd1' },
			clock: { now: () => 1_700_000_000_000 },
			asked,
			written,
			restored
		};
	return it;
}

/** Suggestions as `[from, to, when-declined]`, ignoring the rule and the sentence. */
const shape = (found: { fromId: string; toId: string; dismissed: { at: number } | null }[]) =>
	found.map((s) => [s.fromId, s.toId, s.dismissed?.at ?? null]);

describe('reviewPerson', () => {
	/*
	 * The case the review exists for: all three links were entered long ago, no write is
	 * happening, and the claim is still true. Nothing but a deliberate ask can surface it.
	 */
	it('answers a claim that follows from links stored long before, for the viewer’s graph', async () => {
		const d = deps();
		const found = await reviewPerson(d, viewer, 'steve');
		expect(shape(found)).toEqual([['wingkam', 'steve', null]]);
		expect(found[0]).toMatchObject({ relation: 'parent', fromName: 'Wing Kam', toName: 'Steve' });
		// Two rules reach this one claim; it is offered once, with the reason of the first.
		expect(textOf(found[0]!.reason(createTranslator('en')))).toBe(
			'Wing Kam is a parent of Andy, and Andy and Steve are siblings.'
		);
		expect(d.asked).toEqual([viewer, viewer]);
	});

	it('says nothing about someone the viewer’s graph does not contain', async () => {
		expect(await reviewPerson(deps(), viewer, 'nobody')).toEqual([]);
	});

	it('leaves out a claim the household declined, while still answering the rest', async () => {
		const graph = family();
		graph.siblingEdges = [
			{ a: 'andy', b: 'steve' },
			{ a: 'andy', b: 'nora' }
		];
		graph.people = [...graph.people, { id: 'nora', displayName: 'Nora', gender: 'female' }];
		const log = [declinedClaim()];
		expect(shape(await reviewPerson(deps(graph, log), viewer, 'andy'))).toEqual([
			['wingkam', 'nora', null]
		]);
	});

	it('lists a declined claim when asked, so the no can be taken back', async () => {
		const log = [declinedClaim()];
		expect(
			shape(await reviewPerson(deps(family(), log), viewer, 'steve', { includeDismissed: true }))
		).toEqual([['wingkam', 'steve', 42]]);
	});
});

/*
 * The household-wide pass (docs/concepts/relationship-suggestions.md §6.6). It asks the same
 * question `reviewPerson` asks, about everyone at once — the only scope that reaches a family
 * nobody has thought to open, which is every family in a household that imported its links.
 */
describe('reviewHousehold', () => {
	/** Two families that share nobody: Wing Kam's, and the Freis, entered as siblings only. */
	function twoFamilies(): KinshipGraph {
		const graph = family();
		graph.people = [
			...graph.people,
			{ id: 'jan', displayName: 'Jan', gender: 'male' },
			{ id: 'nora', displayName: 'Nora', gender: 'female' },
			{ id: 'walter', displayName: 'Walter', gender: 'male' }
		];
		graph.parentEdges = [...graph.parentEdges, { parentId: 'walter', childId: 'jan' }];
		graph.siblingEdges = [...graph.siblingEdges, { a: 'jan', b: 'nora' }];
		return graph;
	}

	it('answers about families no member has opened, each claim once', async () => {
		const d = deps(twoFamilies());
		// Wing Kam/Steve is reached from Andy's sibling group, Walter/Nora from Jan's — two
		// separate families, in one pass, and neither claim is offered twice.
		expect(shape(await reviewHousehold(d, viewer))).toEqual([
			['walter', 'nora', null],
			['wingkam', 'steve', null]
		]);
		expect(d.asked).toEqual([viewer, viewer]);
	});

	it('names the people, so the interface can phrase the claim', async () => {
		const [first] = await reviewHousehold(deps(), viewer);
		expect(first).toMatchObject({ fromName: 'Wing Kam', toName: 'Steve', relation: 'parent' });
		expect(textOf(first!.reason(createTranslator('en')))).toBe(
			'Wing Kam is a parent of Andy, and Andy and Steve are siblings.'
		);
	});

	it('leaves out a claim the household declined, and lists it when asked', async () => {
		const log = [declinedClaim()];
		expect(await reviewHousehold(deps(family(), log), viewer)).toEqual([]);
		expect(shape(await reviewHousehold(deps(family(), log), viewer, { includeDismissed: true }))).toEqual([
			['wingkam', 'steve', 42]
		]);
	});

	/*
	 * The graph arrives scoped to the viewer, so a household with nothing visible has nothing
	 * to answer — the same property that keeps a private person out of every other list.
	 */
	it('says nothing when the viewer’s graph is empty', async () => {
		const empty: KinshipGraph = {
			people: [],
			parentEdges: [],
			siblingEdges: [],
			partnerEdges: [],
			storedPairs: []
		};
		const d = deps(empty);
		expect(await reviewHousehold(d, other)).toEqual([]);
		expect(d.asked).toEqual([other, other]);
	});
});

describe('dismissSuggestion', () => {
	it('records the no against the claim, keyed from either end', async () => {
		const d = deps();
		expect(await dismissSuggestion(d, viewer, { relation: 'parent', fromId: 'wingkam', toId: 'steve' })).toBe(true);
		expect(d.written).toEqual([
			{
				id: 'd1',
				householdId: 'h1',
				relation: 'parent',
				pairKey: pairKey('steve', 'wingkam'),
				dismissedBy: 'u1',
				dismissedAt: 1_700_000_000_000
			}
		]);
	});

	it('stops offering the claim it was given', async () => {
		const d = deps();
		await dismissSuggestion(d, viewer, { relation: 'parent', fromId: 'wingkam', toId: 'steve' });
		expect(await reviewPerson(d, viewer, 'steve')).toEqual([]);
	});

	/*
	 * A negative asserted against a positive signal: the write log, not an empty list. A
	 * dismissal names two people, and a form that names someone the viewer cannot see must
	 * not be able to write a row about them.
	 */
	it('refuses a claim about someone outside the viewer’s graph, and writes nothing', async () => {
		const d = deps();
		expect(await dismissSuggestion(d, viewer, { relation: 'parent', fromId: 'wingkam', toId: 'stranger' })).toBe(false);
		expect(d.written).toEqual([]);
	});
});

describe('restoreSuggestion', () => {
	it('puts a declined claim back in front of the household', async () => {
		const d = deps();
		const claim = { relation: 'parent' as const, fromId: 'wingkam', toId: 'steve' };
		await dismissSuggestion(d, viewer, claim);
		expect(await restoreSuggestion(d, viewer, claim)).toBe(true);
		expect(shape(await reviewPerson(d, viewer, 'steve'))).toEqual([['wingkam', 'steve', null]]);
	});

	it('reports nothing taken back when the claim was never declined', async () => {
		const d = deps();
		expect(await restoreSuggestion(d, viewer, { relation: 'sibling', fromId: 'a', toId: 'b' })).toBe(false);
	});

	it('scopes the withdrawal to the viewer’s household, as the port is asked to', async () => {
		const d = deps();
		await restoreSuggestion(d, other, { relation: 'parent', fromId: 'wingkam', toId: 'steve' });
		expect(d.restored).toEqual([[other, 'parent', pairKey('steve', 'wingkam')]]);
	});
});
