import type { Phrase } from '$lib/i18n/phrase';
import type { SuggestionView } from './view';

/*
 * The vocabulary the suggestion engine speaks (docs/concepts/relationship-suggestions.md §6.1,
 * -implementation.md §3).
 *
 * A rule never names a message key, a repository or a route: it answers a `Trigger` by reading
 * the view and returning `Suggestion`s. Keeping that vocabulary in one file is what lets a new
 * rule be added without editing a switch that three other rules share.
 */

/** The link that was just stored. For `parent`, `fromId` is the parent and `toId` the child. */
export interface PrimaryLink {
	kind: 'parent' | 'sibling' | 'partner';
	fromId: string;
	toId: string;
}

/**
 * What a suggested link would record. Narrower than `PrimaryLink.kind`: a partner tie is
 * never *suggested*, because a partner's tie to existing children is a step relationship,
 * which the profile already names without storing anything (docs/02 §2.4.1).
 */
export type Relation = 'parent' | 'sibling';

/**
 * Which rule produced a suggestion, from the catalogue in
 * `docs/concepts/relationship-suggestions.md` §2. Carried so the household can be told what
 * kind of claim it is looking at, and so ordering stays deterministic between rules.
 */
export type RuleId = 'L1' | 'L2';

/**
 * How sure the rule is. `certain` is a logical consequence of what the household entered —
 * a parent of one sibling is a parent of the others — not a guess.
 */
export type Confidence = 'certain' | 'likely' | 'possible';

/**
 * What the engine is answering. A discriminated union rather than a bare id, because the
 * triggers carry different things: a stored link names two people, while the triggers still
 * to come (`person-created`, `form-opened`, `person-reviewed`) name one and a role.
 */
export type Trigger = { kind: 'link-stored'; link: PrimaryLink };

/** A link Stella offers to store, with the sentence explaining why it is offered. */
export interface LinkSuggestion {
	kind: 'link';
	ruleId: RuleId;
	confidence: Confidence;
	relation: Relation;
	/** For a `parent` relation, `fromId` is the parent and `toId` the child. */
	fromId: string;
	toId: string;
	/** Why it is offered, unsaid until the edge knows the reader's language. */
	reason: Phrase;
}

/**
 * What a rule may offer. Only links today; the field prefills and consistency warnings of
 * the catalogue join this union with the rules that raise them.
 */
export type Suggestion = LinkSuggestion;

/** A rule: pure, and answering only the triggers it registered for. */
export type Rule = (trigger: Trigger, view: SuggestionView) => Suggestion[];
