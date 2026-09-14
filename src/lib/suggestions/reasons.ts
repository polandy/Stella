import { phrase, type Phrase } from '$lib/i18n/phrase';

/*
 * The sentence a suggestion carries (docs/concepts/relationship-suggestions-implementation.md
 * §6). A rule knows *why* it fires long before anything knows who will read it, so the reason
 * leaves the domain as a `Phrase` — the key and the names it needs — and the edge renders it
 * in the reader's language. Building the sentence here would put an English genitive in the
 * domain, and German forms it with a preposition instead.
 *
 * One builder per reason shape. Rules name a builder; they never name a message key.
 */

/** Why a link is offered through a sibling: "Lisa is Hans’s sibling." */
export const siblingOf = (sibling: string, of: string): Phrase =>
	phrase('kinship.reason.siblingOf', { sibling, of });

/** Why a link is offered through a parent: "Bettina is Hans’s parent." */
export const parentOf = (parent: string, of: string): Phrase =>
	phrase('kinship.reason.parentOf', { parent, of });
