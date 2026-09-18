/*
 * The household stream's filter (docs/02 §2.22.2) and how the URL carries it. Pure and
 * framework-free, so the domain narrows its reads by the same kinds Home offers as chips, and
 * Home's chips and its `load` agree on one spelling of the query string.
 */

/** Every kind of item the stream carries, in the order a tie on time reads them. */
export const STREAM_KINDS = ['moment', 'interaction', 'relationship', 'person', 'notice'] as const;

/** One of `STREAM_KINDS`. */
export type StreamKind = (typeof STREAM_KINDS)[number];

/** What the viewer narrowed the stream to; `null` means "not narrowed on this axis". */
export interface StreamFilter {
	kind: StreamKind | null;
	/** The household member who did it — the item's actor. */
	memberId: string | null;
}

/** The whole stream. */
export const NO_FILTER: StreamFilter = { kind: null, memberId: null };

/** Query parameter carrying the kind: `?kind=moment`. */
const KIND_PARAM = 'kind';

/** Query parameter carrying the member: `?by=<user id>`. */
const MEMBER_PARAM = 'by';

/** Home, where the stream lives. */
const HOME = '/';

function isStreamKind(value: string | null): value is StreamKind {
	return (STREAM_KINDS as readonly (string | null)[]).includes(value);
}

/**
 * Read the filter from Home's query string. A kind the stream does not have, or a member who is
 * not in `memberIds`, is dropped — so a hand-edited link cannot ask the stream for someone
 * outside the household, and a stale one shows everything rather than nothing.
 */
export function parseStreamFilter(
	params: URLSearchParams,
	memberIds: readonly string[]
): StreamFilter {
	const kind = params.get(KIND_PARAM);
	const memberId = params.get(MEMBER_PARAM);
	return {
		kind: isStreamKind(kind) ? kind : null,
		memberId: memberId !== null && memberIds.includes(memberId) ? memberId : null
	};
}

/** The link to Home narrowed to `filter`; the whole stream is Home itself. */
export function streamFilterHref(filter: StreamFilter): string {
	const params = new URLSearchParams();
	if (filter.kind) params.set(KIND_PARAM, filter.kind);
	if (filter.memberId) params.set(MEMBER_PARAM, filter.memberId);
	const query = params.toString();
	return query ? `${HOME}?${query}` : HOME;
}
