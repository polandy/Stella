/*
 * Where a form post may send the browser afterwards. A `redirectTo` field travels in plain
 * form data, so it is attacker-controlled: anything but a path on this origin is discarded
 * rather than turned into an open redirect (docs/04 §4.7).
 */

/** Where a missing or unsafe destination lands instead. */
export const FALLBACK_DESTINATION = '/';

/**
 * A same-origin path from untrusted form data, or `FALLBACK_DESTINATION`. Only a single
 * leading slash is a path: "//evil.test" and "/\\evil.test" are host-relative URLs in a
 * browser, and a scheme ("https://…", "javascript:…") never starts with one at all.
 */
export function safeDestination(raw: unknown): string {
	if (typeof raw !== 'string') return FALLBACK_DESTINATION;
	if (!raw.startsWith('/')) return FALLBACK_DESTINATION;
	if (raw.startsWith('//') || raw.startsWith('/\\')) return FALLBACK_DESTINATION;
	return raw;
}
