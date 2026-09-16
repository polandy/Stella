import { L1, L2 } from './rules/links';
import { isDerivable } from './suppressions';
import type { Confidence, Rule, Suggestion, Trigger } from './types';
import { claimKey } from './claims';
import type { SuggestionView } from './view';

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
	'link-stored': [L1, L2],
	'person-reviewed': [L1, L2],
	'household-reviewed': [L1, L2]
};

/** Closeness of a claim to certainty, most certain first — the order suggestions are shown in. */
const CONFIDENCE_RANK: Record<Confidence, number> = {
	certain: 0,
	likely: 1,
	possible: 2
};

/**
 * How a caller wants the run shaped. Only the dismissal suppression can be asked to stand
 * down, and only into a *marking*: the panel's "show dismissed" list needs the declined rows
 * to exist so a member can take a *no* back (docs/concepts/relationship-suggestions.md §6.5).
 */
export interface EvaluateOptions {
	/** List declined claims too, each carrying `dismissedAt`, instead of dropping them. */
	includeDismissed?: boolean;
}

/**
 * Whether a suggestion must not be shown at all (docs/concepts/relationship-suggestions.md
 * §6.2). Suppressions 1–4; the guard-refusal check joins them with the slice that introduces
 * it. These are hard drops in every run: there is no reading in which a self-link, an
 * invisible person or an already-stored claim should be listed.
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
 * Suppression 6 — the household's answer. Dropped by default; marked with the moment it was
 * declined when the caller asked to see what was declined, so *show dismissed* has something
 * to offer an undo on.
 */
function answered(suggestion: Suggestion, view: SuggestionView): Suggestion {
	const dismissed = view.answerTo(suggestion.relation, suggestion.fromId, suggestion.toId);
	return dismissed === null ? suggestion : { ...suggestion, dismissed };
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
 * Exported so it can be tested on the claims themselves rather than only through whichever
 * rules a trigger happens to select: a review points L1 and L2 at a whole neighbourhood, and
 * both can arrive at the same pair from different links.
 */
export function oneRowPerClaim(suggestions: readonly Suggestion[]): Suggestion[] {
	const claimed = new Set<string>();
	return suggestions.filter((suggestion) => {
		const claim = claimKey(suggestion.relation, suggestion.fromId, suggestion.toId);
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
export function evaluate(
	trigger: Trigger,
	view: SuggestionView,
	options: EvaluateOptions = {}
): Suggestion[] {
	const found = RULES[trigger.kind]
		.flatMap((rule) => rule(trigger, view))
		.filter((suggestion) => !suppressed(suggestion, view))
		.map((suggestion) => answered(suggestion, view))
		.filter((suggestion) => options.includeDismissed || suggestion.dismissed === null)
		.sort((x, y) => order(x, y, view));
	// Ordering runs first, so the row that survives a duplicated claim is the most certain one.
	return oneRowPerClaim(found);
}
