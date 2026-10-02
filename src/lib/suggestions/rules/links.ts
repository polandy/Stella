import type { KinPerson, ParentEdge, PartnerEdge } from '$lib/kinship/kinship';
import { MAX_PARENTS } from '$lib/relationships/exclusions';
import { parentThroughSibling, partnerOfParent } from '../reasons';
import type { LinkSuggestion, PrimaryLink, Rule, RuleId, Trigger } from '../types';
import type { SuggestionView } from '../view';

/*
 * The link rules (docs/concepts/relationship-suggestions.md §3, L1, L2 and L3).
 *
 * Adding one primary link usually implies others: a mother added to one child is the mother
 * of that child's siblings too. Stella works those out and **offers** them — one confirmation
 * each, never a silent write (docs/02 §2.4.1, "suggestions are always opt-in").
 *
 * A rule says only what follows. It does not ask whether the claim is already stored, already
 * derived, or fit to show: the engine applies those suppressions to every rule's output at
 * once, because a rule that filters is a rule that can forget to.
 *
 * Both rules offer a **parent** link — the one relation an implication can be written to. A
 * partner's tie to existing children is a step relationship: it has no stored type and needs
 * none, because the kinship engine already names it on the profile.
 *
 * Neither rule knows which trigger pointed it at a link. A write names one link; a review names
 * the whole neighbourhood of one person (§6.5) — and that difference belongs in `linksInScope`,
 * not spread through every rule that would otherwise grow a second branch.
 */

/**
 * The primary links a trigger puts in front of the rules: the one that was just stored, the
 * links standing around one subject and their siblings, or — for a household pass (§6.6) —
 * every link there is. A review therefore reaches claims that were raised and lost long before
 * anyone thought to look at them, and a household pass reaches the families nobody opened.
 */
function linksInScope(trigger: Trigger, view: SuggestionView): readonly PrimaryLink[] {
	switch (trigger.kind) {
		case 'link-stored':
			return [trigger.link];
		case 'person-reviewed':
			return view.primaryLinksAround(trigger.subjectId);
		case 'household-reviewed':
			return view.allPrimaryLinks();
	}
}

/**
 * A parent claim. L1 and L2 are `certain` — a logical consequence of what the household
 * entered; L3 is only `likely`, because a partner may be a step-parent.
 */
function parentLink(
	ruleId: Exclude<RuleId, 'K1'>,
	parentId: string,
	childId: string,
	reason: LinkSuggestion['reason']
): LinkSuggestion {
	return {
		kind: 'link',
		ruleId,
		confidence: ruleId === 'L3' ? 'likely' : 'certain',
		relation: 'parent',
		fromId: parentId,
		toId: childId,
		reason,
		// Never a rule's to answer: the engine drops or marks a declined claim (§6.4).
		dismissed: null
	};
}

/** L1 — a parent stored for one child is a parent of that child's siblings. */
export const L1: Rule = (trigger: Trigger, view: SuggestionView): LinkSuggestion[] => {
	const who = (id: string) => ({ id, name: view.nameOf(id) });
	return linksInScope(trigger, view)
		.filter((link) => link.kind === 'parent')
		.flatMap(({ fromId: parentId, toId: childId }) =>
			[...view.siblingsOf(childId)].map((sibling) =>
				parentLink(
					'L1',
					parentId,
					sibling,
					parentThroughSibling(who(parentId), who(childId), who(sibling))
				)
			)
		);
};

/** L2 — a stored sibling link means each side's known parents are the other's parents. */
export const L2: Rule = (trigger: Trigger, view: SuggestionView): LinkSuggestion[] => {
	const who = (id: string) => ({ id, name: view.nameOf(id) });
	const found: LinkSuggestion[] = [];
	for (const link of linksInScope(trigger, view)) {
		if (link.kind !== 'sibling') continue;
		for (const [one, other] of [
			[link.fromId, link.toId],
			[link.toId, link.fromId]
		] as const) {
			for (const parent of view.parentsOf(one)) {
				found.push(
					parentLink('L2', parent, other, parentThroughSibling(who(parent), who(one), who(other)))
				);
			}
		}
	}
	return found;
};

/**
 * What `likelyCoParent` reads: the people's birth dates and the parent and partner links. A
 * `KinshipGraph` is one; the relationship form builds one from the facts its page already holds.
 */
export interface CoParentGraph {
	people: readonly Pick<KinPerson, 'id' | 'birthDate'>[];
	parentEdges: readonly ParentEdge[];
	partnerEdges: readonly PartnerEdge[];
}

/** A date as far as it goes: `2015`, `2015-05` or `2015-05-20`. A year-less day says nothing. */
const DATED = /^\d{4}(-\d{2}(-\d{2})?)?$/;

/**
 * Whether `since` lies after `birth`, compared only as far as both dates go: a later year is
 * later whatever the day, but the same year cannot say which came first. Unknown is not after.
 */
function beganAfter(since: string | null | undefined, birth: string | null | undefined): boolean {
	if (!since || !birth || !DATED.test(since) || !DATED.test(birth)) return false;
	const length = Math.min(since.length, birth.length);
	// Both are ISO prefixes of the same length, which sort as text.
	return since.slice(0, length) > birth.slice(0, length);
}

/**
 * Rule L3 as a question: who is likely the child's other parent, given that `parentId` is
 * (or is about to be) one of them? The parent's one current partner — or nobody.
 *
 * Nobody when the parent has no current partner or several (the concept's L3b: no basis to pick
 * one); when the partnership began after the child was born, which makes the partner a
 * step-parent, a tie Stella names rather than stores (docs/02 §2.4.1); when the child would end
 * up with more than two parents (the exclusion rules' cap) or the partner already is one; and
 * when the generation guard would refuse the link anyway. The form also asks the page's own
 * `exclusionFor` before it offers anyone, so a rule added there later is honoured too. Missing dates do not rule it out: the
 * claim stays `likely`, and the household answers it.
 *
 * Pure. The engine asks it once a parent link is stored; the relationship form asks it while a
 * parent is only picked (docs/concepts/multi-pick-relationships.html D4), which is why the
 * chosen parent counts whether or not their link is on record yet.
 */
export function likelyCoParent(graph: CoParentGraph, parentId: string, childId: string): string | null {
	const current = graph.partnerEdges.filter((edge) => !edge.former);
	const partners = new Set(
		current.flatMap((edge) =>
			edge.a === parentId ? [edge.b] : edge.b === parentId ? [edge.a] : []
		)
	);
	if (partners.size !== 1) return null;
	const [partnerId] = partners as Set<string>;
	if (partnerId === childId) return null;

	const parents = new Set(
		graph.parentEdges.filter((edge) => edge.childId === childId).map((edge) => edge.parentId)
	);
	// The exclusion rules' parent cap (docs/02 §2.4), counting the chosen parent. A partner who
	// is a parent already fills a slot too, so they are never offered a second time.
	if (new Set([...parents, parentId]).size >= MAX_PARENTS) return null;

	// The other way round already: the partner is recorded as the child's own child.
	if (graph.parentEdges.some((edge) => edge.parentId === childId && edge.childId === partnerId)) {
		return null;
	}

	const partnership = current.filter(
		(edge) =>
			(edge.a === parentId && edge.b === partnerId) || (edge.a === partnerId && edge.b === parentId)
	);
	const birth = graph.people.find((person) => person.id === childId)?.birthDate;
	if (partnership.some((edge) => beganAfter(edge.sinceDate, birth))) return null;

	return partnerId;
}

/**
 * L3 — a parent stored for a child offers the parent's one current partner as the other parent
 * (`likely`). Only after a write, never on a review: run over the whole household it would
 * offer every step-parent whose partnership has no date, which is most of them. And not when the
 * link was entered on the child's page, where the form offered the partner before the save.
 */
export const L3: Rule = (trigger: Trigger, view: SuggestionView): LinkSuggestion[] => {
	if (trigger.kind !== 'link-stored' || trigger.link.kind !== 'parent') return [];
	const { fromId: parentId, toId: childId } = trigger.link;
	if (trigger.enteredFrom === childId) return [];
	const partnerId = likelyCoParent(view, parentId, childId);
	if (!partnerId) return [];
	const who = (id: string) => ({ id, name: view.nameOf(id) });
	return [
		parentLink('L3', partnerId, childId, partnerOfParent(who(partnerId), who(parentId), who(childId)))
	];
};
