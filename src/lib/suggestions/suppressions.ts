import { deriveKinship, type KinTerm } from '$lib/kinship/kinship';
import { MAX_PARENTS } from '$lib/relationships/exclusions';
import type { Relation } from './types';
import type { SuggestionView } from './view';

/*
 * The universal suppressions (docs/concepts/relationship-suggestions.md §6.2).
 *
 * They are applied by the engine to every rule's output, never inside a rule: a rule that
 * filters is a rule that can forget to, and the consequence of forgetting is not a stray row
 * on a screen but an entered link that permanently replaces something Stella used to work out.
 *
 * Pure predicates over the view, so they can be asked a question rather than only made to act.
 */

/**
 * The derived terms that mean the same relation a suggestion would store.
 *
 * The comparison is on the **relation, not the pair** — this is the distinction the whole
 * design turns on. Derivation calls a partner the *step-parent* of their partner's child,
 * which is precisely the pair a rule wants to offer as **parent**: a different relation, so
 * the offer survives. A pair derivation already calls siblings is a different matter — that
 * claim is already made, and storing it would bury the inference under a duplicate row.
 *
 * `half-sibling` counts as a sibling claim: it is the finer name for the same tie, and
 * storing a plain sibling link over it would lose the distinction the engine worked out.
 * Step-family terms count as neither — a step-sibling is not a sibling.
 *
 * Derivation has no term meaning `parent`: a parent is entered, never inferred. The empty
 * set is deliberate, and `suppressions.test.ts` holds it in place.
 */
const TERMS_MEANING: Record<Relation, readonly KinTerm[]> = {
	parent: [],
	sibling: ['sibling', 'half-sibling']
};

/**
 * Whether the kinship engine already names `subjectId` as `relation` of `objectId`, in which
 * case Stella must not offer to store it (suppression 2).
 */
export function isDerivable(
	view: SuggestionView,
	relation: Relation,
	subjectId: string,
	objectId: string
): boolean {
	const terms = TERMS_MEANING[relation];
	if (terms.length === 0) return false;
	return deriveKinship(view, objectId).some(
		(kin) => kin.personId === subjectId && terms.includes(kin.term)
	);
}

/**
 * Whether storing this claim would be **refused** (suppression 5, docs/02 §2.4). Offering
 * something and then rejecting it on *Accept* is worse than never offering it: the household
 * is told a link follows, presses the only button there is, and gets an error about a rule it
 * never broke. The parent cap is the one such rule an implication can reach, since both link
 * rules offer parent claims and a child already has whatever parents it has.
 */
export function isRefusedByRules(
	view: SuggestionView,
	relation: Relation,
	_subjectId: string,
	objectId: string
): boolean {
	return relation === 'parent' && view.parentsOf(objectId).size >= MAX_PARENTS;
}
