import { claimEndpoints, confirmedClaimFor } from '$lib/kinship/claims';
import { deriveKinship, deriveKinshipForAll, variantFor, type DerivedKin } from '$lib/kinship/kinship';
import { RELATION_FOR_TYPE_KEY } from '$lib/relationships/type-keys';
import { workedOutThrough } from '../reasons';
import { isDirected, type LinkSuggestion, type Rule, type Trigger } from '../types';
import type { SuggestionView } from '../view';

/*
 * K1 — a worked-out relative, offered for entering (docs/02 §2.4.1,
 * docs/concepts/relationship-suggestions.md §3.5).
 *
 * The derived block on a profile already carries *Confirm*; this puts the same question into
 * the review, so a household working through what Stella knows meets it in one list. It is
 * the one rule suppression 2 does not apply to (engine.ts): offering what is derived is its
 * whole point, and nothing is stored before the household says so.
 *
 * Reviews only. A write raises what *follows* from it (L1, L2); what is merely worked out has
 * stood there all along, and is asked about when somebody asks.
 */

/** The relatives worked out for whoever the trigger is about, each paired with its subject. */
function relativesInScope(trigger: Trigger, view: SuggestionView): [string, DerivedKin][] {
	switch (trigger.kind) {
		case 'link-stored':
			return [];
		case 'person-reviewed':
			return deriveKinship(view, trigger.subjectId).map((kin) => [trigger.subjectId, kin]);
		case 'household-reviewed':
			return [...deriveKinshipForAll(view)].flatMap(([subjectId, relatives]) =>
				relatives.map((kin): [string, DerivedKin] => [subjectId, kin])
			);
	}
}

export const K1: Rule = (trigger: Trigger, view: SuggestionView): LinkSuggestion[] => {
	const people = new Map(view.people.map((person) => [person.id, person]));
	return relativesInScope(trigger, view).flatMap(([subjectId, kin]) => {
		// A step term is corrected to a direct link on the profile, never entered as it is.
		const confirmed = confirmedClaimFor(kin.term);
		const relation = confirmed && RELATION_FOR_TYPE_KEY[confirmed.typeKey];
		if (!confirmed || !relation) return [];
		const { fromId, toId } = claimEndpoints(confirmed, subjectId, kin.personId);
		const via = kin.viaIds.map((id) => ({ id, name: view.nameOf(id) }));
		// The sentence names the elder where there is one, and otherwise the relative.
		const named = people.get(isDirected(relation) ? fromId : toId);
		return [
			{
				kind: 'link',
				ruleId: 'K1',
				confidence: 'certain',
				relation,
				fromId,
				toId,
				reason: workedOutThrough(via),
				variant: named ? variantFor(named) : 'neutral',
				dismissed: null
			}
		];
	});
};
