/*
 * How a link's span reads on a profile line (docs/dev/02 §2.4): "2015–2018" once it has both ends,
 * so a foster mother or a former partnership is told at a glance. A one-sided span is said in
 * words by the caller ("since …", "until …"), which need the viewer's language.
 */

/** `YYYY` of an ISO day, or null when the value does not start with a year. */
const yearOf = (day: string): string | null => /^\d{4}/.exec(day)?.[0] ?? null;

/** The years a link ran, `2015–2018`, one year when both ends fall in it; null unless both are set. */
export function yearSpan(since: string | null, until: string | null): string | null {
	const from = since ? yearOf(since) : null;
	const to = until ? yearOf(until) : null;
	if (!from || !to) return null;
	return from === to ? from : `${from}–${to}`;
}
