/*
 * `?propose=<a>:<b>` names the pair whose new link should be propagated (docs/02 §2.4.1).
 * The pair is only a pointer: the use-case reads the real link back from the visible graph,
 * so a hand-written value can never conjure a suggestion out of nothing.
 */

const PROPOSE_SEPARATOR = ':';

/** The person page after a new link from `contactId` to `targetId`, offering what it implies. */
export function proposeHref(contactId: string, targetId: string): string {
	return `/contacts/${contactId}?propose=${[contactId, targetId].join(PROPOSE_SEPARATOR)}#relationships`;
}

/** The pair a `?propose=` value names, or null. */
export function parseProposePair(raw: string | null): { a: string; b: string } | null {
	const [a, b] = (raw ?? '').split(PROPOSE_SEPARATOR);
	return a && b ? { a, b } : null;
}
