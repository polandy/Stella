import { L1, L2 } from './rules/links';
import { isDerivable } from './suppressions';
import type { Confidence, Rule, Suggestion, Trigger } from './types';
import { pairKey, type SuggestionView } from './view';

/*
 * The suggestion engine (docs/concepts/relationship-suggestions.md §6).
 *
 * `evaluate` selects the rules that answer the trigger, applies the universal suppressions to
 * all of their output **at once**, and orders what is left. The suppressions live here rather
 * than in the rules because a rule that filters is a rule that can forget to — and forgetting
 * means offering to store what Stella already works out, which permanently replaces a derived
 * label with an entered row.
 *
 * Pure: no repository, no clock, no `$env`. The view it reads has already been scoped to one
 * viewer by the repository, so the engine never filters for visibility — it only refuses to
 * name a person the view does not contain.
 */

/** Which rules answer which trigger. A new rule is a row here, not an edit to a shared switch. */
const RULES: Record<Trigger['kind'], readonly Rule[]> = {
	'link-stored': [L1, L2]
};

/** Closeness of a claim to certainty, most certain first — the order suggestions are shown in. */
const CONFIDENCE_RANK: Record<Confidence, number> = {
	certain: 0,
	likely: 1,
	possible: 2
};

/**
 * Whether a suggestion must not be shown (docs/concepts/relationship-suggestions.md §6.2).
 * Suppressions 1–4; the guard-refusal and dismissal checks join them with the slices that
 * introduce them.
 */
function suppressed(suggestion: Suggestion, view: SuggestionView): boolean {
	const { fromId, toId, relation } = suggestion;
	return (
		fromId === toId ||
		!view.has(fromId) ||
		!view.has(toId) ||
		view.isLinked(fromId, toId) ||
		isDerivable(view, relation, fromId, toId)
	);
}

/**
 * Confidence first, then the rule, then the people named — so a household sees the same list
 * in the same order on every run, and a test can assert a list rather than a set.
 */
function order(x: Suggestion, y: Suggestion, view: SuggestionView): number {
	return (
		CONFIDENCE_RANK[x.confidence] - CONFIDENCE_RANK[y.confidence] ||
		x.ruleId.localeCompare(y.ruleId) ||
		view.nameOf(x.fromId).localeCompare(view.nameOf(y.fromId)) ||
		view.nameOf(x.toId).localeCompare(view.nameOf(y.toId))
	);
}

/**
 * One row per claim, keeping the first — so the household is asked a question once however
 * many rules reached it. It answers the **claim**, not the rule that happened to surface it,
 * which is the same reason a dismissal is keyed by the claim (§6.4).
 *
 * Exported because with one rule per trigger nothing can reach a claim twice yet; L3 is the
 * first rule that can name a pair L1 also names, and this must already be right when it lands.
 */
export function oneRowPerClaim(suggestions: readonly Suggestion[]): Suggestion[] {
	const claimed = new Set<string>();
	return suggestions.filter((suggestion) => {
		const claim = `${suggestion.relation}|${pairKey(suggestion.fromId, suggestion.toId)}`;
		if (claimed.has(claim)) return false;
		claimed.add(claim);
		return true;
	});
}

/**
 * What Stella offers in answer to `trigger`, ready for one confirmation each. Nothing here is
 * ever written: a suggestion is a question, and the use-case re-runs every guard when the
 * household answers it.
 */
export function evaluate(trigger: Trigger, view: SuggestionView): Suggestion[] {
	const found = RULES[trigger.kind]
		.flatMap((rule) => rule(trigger, view))
		.filter((suggestion) => !suppressed(suggestion, view))
		.sort((x, y) => order(x, y, view));
	// Ordering runs first, so the row that survives a duplicated claim is the most certain one.
	return oneRowPerClaim(found);
}
