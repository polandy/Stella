/*
 * `?propose=<a>:<b>,<a>:<c>` names the pairs whose new links should be propagated (docs/02
 * §2.4.1): one pair after a single link, every pair of a batch stored together, so *Also true?*
 * is worked out across all of them (docs/02 §2.4, *Several people in one go*). The pairs
 * are only pointers: the use-case reads the real links back from the visible graph, so a
 * hand-written value can never conjure a suggestion out of nothing.
 */

import { contactSectionPath } from './sections';

const PROPOSE_SEPARATOR = ':';
const PAIR_SEPARATOR = ',';

/** The person page after new links from `contactId` to each of `targetIds`, offering what they imply. */
export function proposeHref(contactId: string, targetIds: readonly string[]): string {
	const pairs = targetIds.map((targetId) => [contactId, targetId].join(PROPOSE_SEPARATOR));
	return contactSectionPath(contactId, 'relationships', `propose=${pairs.join(PAIR_SEPARATOR)}`);
}

/** The pairs a `?propose=` value names, in order; a half pair is skipped. */
export function parseProposePairs(raw: string | null): { a: string; b: string }[] {
	return (raw ?? '').split(PAIR_SEPARATOR).flatMap((pair) => {
		const [a, b] = pair.split(PROPOSE_SEPARATOR);
		return a && b ? [{ a, b }] : [];
	});
}
