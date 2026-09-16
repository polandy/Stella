import type { Relation } from './types';

/*
 * What a suggestion is *about*, and the log of the ones the household has declined
 * (docs/concepts/relationship-suggestions.md §6.4).
 *
 * A claim is a relation over an unordered pair. Every question Stella asks about a suggestion
 * without caring which rule raised it — has this been answered, has it already been offered in
 * this run — is a question about the claim, so the key is built in exactly one place.
 *
 * A suggestion is recomputed from the graph every time it is asked for, so a *no* that is not
 * written down is a *no* that gets asked again tomorrow. With the on-demand review — a control
 * a member can press as often as they like — that stops being a nuisance and starts making the
 * panel unusable, which is why the log is a prerequisite of §6.5 rather than a nicety.
 *
 * It is keyed by the **claim**, never by the rule: declining "Wing Kam is Steve's parent" is an
 * answer about those two people and that relation, and it must stay answered however another
 * rule reaches the same pair later.
 *
 * A dismissal constrains only what Stella *offers*. It never touches what the kinship engine
 * derives or what a profile displays.
 */

/** Separates the relation from the pair, so one claim has exactly one key. */
const CLAIM_SEPARATOR = '|';

/** A pair named the same way from either end, for comparing and for keying a dismissal. */
export const pairKey = (x: string, y: string) => (x < y ? `${x} ${y}` : `${y} ${x}`);

/** Who in the household declined a claim, and when. */
export interface Answer {
	at: number;
	/** The member who clicked. The *no* belongs to the household; the name is for the trail. */
	by: string;
}

/** One declined claim, as the household's log holds it. */
export interface Dismissal {
	relation: Relation;
	/** The ordered-pair key the view computes, so either end names the same row. */
	pairKey: string;
	dismissedAt: number;
	dismissedBy: string;
}

/** The identity of a claim: this relation over these two people, from either end. */
export const claimKey = (relation: Relation, x: string, y: string): string =>
	`${relation}${CLAIM_SEPARATOR}${pairKey(x, y)}`;

/** The household's answer to this claim, or null while it stands unanswered. */
export type AnswerTo = (relation: Relation, x: string, y: string) => Answer | null;

/** Indexes the household's log into the question the engine asks of it. */
export function indexDismissals(dismissals: readonly Dismissal[]): AnswerTo {
	const byClaim = new Map(
		dismissals.map((d): [string, Answer] => [
			`${d.relation}${CLAIM_SEPARATOR}${d.pairKey}`,
			{ at: d.dismissedAt, by: d.dismissedBy }
		])
	);
	return (relation, x, y) => byClaim.get(claimKey(relation, x, y)) ?? null;
}
