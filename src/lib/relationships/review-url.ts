/*
 * The household review's address (docs/concepts/relationship-review-at-scale.html).
 *
 * Every fold in that screen is a link, not a script: the pager, the search and the declined log
 * each have their own URL, so the review works with JavaScript off, survives a reload, and can
 * be handed to the other member working the same import. Which means the query string is a real
 * interface — built and read in one place rather than concatenated at four call sites.
 *
 * It also decides where an answer returns to. A member who declines a claim on page four
 * belongs back on page four; losing their place is how a long list stops being finishable.
 */

/** The review runs only when asked for, so the pass itself hangs on the URL. */
export const REVIEW_PARAM = 'review';

/** The person search, applied to the computed groups rather than to a second rule pass. */
export const QUERY_PARAM = 'q';

/** The key of the last group on the previous page — a key, never an offset (see `paging.ts`). */
export const AFTER_PARAM = 'after';

/** The key of the first group on the next page, for walking backwards. */
export const BEFORE_PARAM = 'before';

/** The declined log, once it has outgrown the drawer inside the list. */
export const DECLINED_PARAM = 'declined';

/** Where the review lives. */
export const REVIEW_BASE = '/settings/relationships';

/**
 * The hidden field a form carries its place back in.
 *
 * A form action is resolved against the current URL: `?/dismissSuggestion` replaces the whole
 * query string, so the search and the cursor are gone before the server ever sees the POST.
 * The place therefore travels in the body, and the redirect is rebuilt with `reviewHref` —
 * which constructs the path itself, so a tampered field can only ever land back on this screen.
 */
export const RETURN_TO_FIELD = 'returnTo';

/** A place inside the review: which fold, filtered how, at which cursor. */
export interface ReviewLocation {
	query?: string | null;
	after?: string | null;
	before?: string | null;
	/** The declined log rather than the open list. */
	declined?: boolean;
}

/**
 * The URL for a place in the review. `review` is always present — a link that dropped it would
 * quietly close the pass and show the idle screen instead.
 */
export function reviewHref(at: ReviewLocation = {}): string {
	const params = new URLSearchParams();
	params.set(REVIEW_PARAM, '');
	if (at.declined) params.set(DECLINED_PARAM, '');
	if (at.query) params.set(QUERY_PARAM, at.query);
	if (at.after) params.set(AFTER_PARAM, at.after);
	else if (at.before) params.set(BEFORE_PARAM, at.before);
	// `review=` and `declined=` are presence flags; the trailing `=` is noise in a shared link.
	return `${REVIEW_BASE}?${params.toString().replace(/=(?=&|$)/g, '')}`;
}

/**
 * Reads a place back out of a request's query string, ignoring everything else on it — a form
 * POST arrives with SvelteKit's `/action` parameter attached, and that must not survive into
 * the redirect.
 */
export function reviewLocationFrom(params: URLSearchParams): ReviewLocation {
	return {
		query: params.get(QUERY_PARAM),
		after: params.get(AFTER_PARAM),
		before: params.get(BEFORE_PARAM),
		declined: params.has(DECLINED_PARAM)
	};
}

/**
 * The place with anything the fold in question does not use dropped.
 *
 * The declined log is household-wide history and takes no search — carrying the list's `q`
 * onto it would put a filter in the address that nothing applies, and then hand it back to the
 * list as if the reader had searched for it. Normalising here means a hand-typed one is dropped
 * on the next click rather than quietly describing a list that was never filtered.
 */
export const placeOf = (at: ReviewLocation): ReviewLocation =>
	at.declined ? { declined: true, after: at.after, before: at.before } : at;

/** True when the reader has asked for the pass at all. Closed, the screen runs no rules. */
export const reviewIsOpen = (params: URLSearchParams): boolean => params.has(REVIEW_PARAM);

/** The review's own query string, for a form to carry back in `RETURN_TO_FIELD`. */
export const reviewQuery = (at: ReviewLocation = {}): string =>
	reviewHref(at).slice(REVIEW_BASE.length + 1);

/** Where an answer returns to, rebuilt from what the form carried. Never an arbitrary URL. */
export const returnedTo = (carried: FormDataEntryValue | null): string =>
	reviewHref(reviewLocationFrom(new URLSearchParams(typeof carried === 'string' ? carried : '')));
