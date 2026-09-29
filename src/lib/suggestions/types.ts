import type { LinkedPhrase } from '$lib/i18n/linked';
import type { KinVariant } from '$lib/kinship/kinship';
import type { Answer } from './claims';
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
 * What a suggested link would record. `parent` and `sibling` follow from what was entered
 * (L1, L2); the rest are the relatives Stella works out, offered for entering (K1). A partner
 * tie is never *suggested*, and neither is a step term: a partner's tie to existing children
 * is a step relationship, which the profile corrects in place rather than stores
 * (docs/02 §2.4.1). Each relation is stored as one built-in type (`TYPE_KEY_FOR_RELATION`).
 */
export const RELATIONS = [
	'parent',
	'sibling',
	'half-sibling',
	'grandparent',
	'great-grandparent',
	'aunt-uncle',
	'cousin',
	'parent-in-law',
	'sibling-in-law'
] as const;

/** One of `RELATIONS`. */
export type Relation = (typeof RELATIONS)[number];

/**
 * The relations that run from one generation to the next. For these a claim's `fromId` is the
 * elder — the parent, the grandparent, the aunt — and the claim is about the younger end.
 */
const DIRECTED: ReadonlySet<Relation> = new Set([
	'parent',
	'grandparent',
	'great-grandparent',
	'aunt-uncle',
	'parent-in-law'
]);

/** Whether a relation has an elder end, which then stands at `fromId`. */
export const isDirected = (relation: Relation): boolean => DIRECTED.has(relation);

/**
 * Which rule produced a suggestion, from the catalogue in
 * `docs/concepts/relationship-suggestions.md` §2. Carried so the household can be told what
 * kind of claim it is looking at, and so ordering stays deterministic between rules.
 */
export type RuleId = 'L1' | 'L2' | 'K1';

/**
 * How sure the rule is. `certain` is a logical consequence of what the household entered —
 * a parent of one sibling is a parent of the others — not a guess.
 */
export type Confidence = 'certain' | 'likely' | 'possible';

/**
 * What the engine is answering. A discriminated union rather than a bare id, because the
 * triggers carry different things: a stored link names two people, while the triggers still
 * to come (`person-created`, `form-opened`) name one and a role.
 *
 * `person-reviewed` is the one trigger no write raises: a member asks, on request, what stands
 * around this person right now. It is what makes the rule set reachable at all — every other
 * trigger only exists in the instant after a link is stored
 * (docs/concepts/relationship-suggestions.md §6.5).
 *
 * `household-reviewed` widens that ask to everyone the viewer can see (§6.6). It is a
 * different question rather than a wider `where`: a per-person review only ever reaches the
 * people somebody thought to open, and a household that imported its links has opened none of
 * them.
 */
export type Trigger =
	| { kind: 'link-stored'; link: PrimaryLink }
	| { kind: 'person-reviewed'; subjectId: string }
	| { kind: 'household-reviewed' };

/** A link Stella offers to store, with the sentence explaining why it is offered. */
export interface LinkSuggestion {
	kind: 'link';
	ruleId: RuleId;
	confidence: Confidence;
	relation: Relation;
	/** For a directed relation (`isDirected`), `fromId` is the elder and `toId` the younger. */
	fromId: string;
	toId: string;
	/**
	 * Why it is offered, unsaid until the edge knows the reader's language — and still carrying
	 * the people it names, so every name in it can be followed to that person.
	 */
	reason: LinkedPhrase;
	/**
	 * The gender of the person the claim's sentence names — the elder of a directed relation,
	 * the relative (`toId`) of a symmetric one — so it reads *an aunt of*, not *an aunt or
	 * uncle of*, where the gender is on record. Only worked-out claims (K1) carry one.
	 */
	variant?: KinVariant;
	/**
	 * The household's *no* — who declined this claim and when — or null while it stands. A rule
	 * never sets it: the engine drops a dismissed suggestion outright, and only fills this in
	 * when the caller asked to see what was declined
	 * (docs/concepts/relationship-suggestions.md §6.5).
	 */
	dismissed: Answer | null;
}

/**
 * What a rule may offer. Only links today; the field prefills and consistency warnings of
 * the catalogue join this union with the rules that raise them.
 */
export type Suggestion = LinkSuggestion;

/** A rule: pure, and answering only the triggers it registered for. */
export type Rule = (trigger: Trigger, view: SuggestionView) => Suggestion[];
