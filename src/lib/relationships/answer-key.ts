import { claimKey, pairKey } from '../suggestions/claims';
import type { Relation } from '../suggestions/types';
import { removalKey } from '../undo/keys';

/**
 * The key an answered suggestion is held under while its undo window is open.
 *
 * Built from the claim's own identity — `(relation, pair)`, from either end — rather than from
 * the rule that raised it, so the household screen cannot offer one claim two ways and end up
 * holding two answers to it (docs/concepts/relationship-suggestions.md §6.4).
 */
export const answerKey = (relation: Relation, fromId: string, toId: string): string =>
	removalKey('suggestion', claimKey(relation, fromId, toId));

/**
 * The fragment a no-JavaScript answer comes back to.
 *
 * Without the undo window the answer still posts and the page still reloads, so the least it
 * can do is land beside the row that was answered rather than at the top. Built from the same
 * pair, so it names the claim; only characters a fragment may carry.
 */
export const answerAnchor = (relation: Relation, fromId: string, toId: string): string =>
	`claim-${relation}-${pairKey(fromId, toId).replace(' ', '-')}`;

/** What `answerAnchor` produces, and the only thing a redirect will append. */
export const ANSWER_ANCHOR_PATTERN = /^claim-[A-Za-z0-9-]+$/;

/** The hidden field the anchor travels in, like the return location beside it. */
export const ANSWER_ANCHOR_FIELD = 'anchor';

/** Where a no-JavaScript answer returns to: the place, plus the row, if it is really one. */
export function withAnchor(path: string, carried: FormDataEntryValue | null): string {
	return typeof carried === 'string' && ANSWER_ANCHOR_PATTERN.test(carried)
		? `${path}#${carried}`
		: path;
}
