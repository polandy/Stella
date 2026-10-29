import { tagKey } from '../hashtags/hashtags';

/*
 * The household stream's filter (docs/02 §2.22.2) and how the URL carries it. Pure and
 * framework-free, so the domain narrows its reads by the same kinds Home offers as chips, and
 * Home's chips and its `load` agree on one spelling of the query string.
 */

/** Every kind of item the stream carries, in the order a tie on time reads them. */
export const STREAM_KINDS = [
	'moment',
	'interaction',
	'relationship',
	'person',
	'circlePhoto',
	'notice'
] as const;

/** One of `STREAM_KINDS`. */
export type StreamKind = (typeof STREAM_KINDS)[number];

/** What the viewer narrowed the stream to; `null` means "not narrowed on this axis". */
export interface StreamFilter {
	kind: StreamKind | null;
	/** The household member who did it — the item's actor. */
	memberId: string | null;
	/**
	 * The keys of the tags a moment must all carry (docs/02 §2.20.2), in the order chosen; only
	 * ever non-empty with `kind: 'moment'`.
	 */
	tags: readonly string[];
}

/** The whole stream. */
export const NO_FILTER: StreamFilter = { kind: null, memberId: null, tags: [] };

/** Query parameter carrying the kind: `?kind=moment`. */
const KIND_PARAM = 'kind';

/** Query parameter carrying the member: `?by=<user id>`. */
const MEMBER_PARAM = 'by';

/** Query parameter carrying a tag's key, once per tag: `?tag=walk&tag=lake`. */
const TAG_PARAM = 'tag';

/** Home, where the stream lives. */
const HOME = '/';

function isStreamKind(value: string | null): value is StreamKind {
	return (STREAM_KINDS as readonly (string | null)[]).includes(value);
}

/**
 * Read the filter from Home's query string. A kind the stream does not have, or a member who is
 * not in `memberIds`, is dropped — so a hand-edited link cannot ask the stream for someone
 * outside the household, and a stale one shows everything rather than nothing. Only moments
 * carry tags, so a tag narrows to moments, and beside another kind the tags are dropped.
 */
export function parseStreamFilter(
	params: URLSearchParams,
	memberIds: readonly string[]
): StreamFilter {
	const rawKind = params.get(KIND_PARAM);
	const kind = isStreamKind(rawKind) ? rawKind : null;
	const memberId = params.get(MEMBER_PARAM);
	const keys = params
		.getAll(TAG_PARAM)
		.map((raw) => raw.trim().replace(/^#/, ''))
		.filter((raw) => raw !== '')
		.map(tagKey);
	const tags = kind === null || kind === 'moment' ? [...new Set(keys)] : [];
	return {
		kind: tags.length ? 'moment' : kind,
		memberId: memberId !== null && memberIds.includes(memberId) ? memberId : null,
		tags
	};
}

/** The link to Home narrowed to `filter`; the whole stream is Home itself. */
export function streamFilterHref(filter: StreamFilter): string {
	const params = new URLSearchParams();
	if (filter.kind) params.set(KIND_PARAM, filter.kind);
	if (filter.memberId) params.set(MEMBER_PARAM, filter.memberId);
	if (filter.kind === 'moment') for (const tag of filter.tags) params.append(TAG_PARAM, tag);
	const query = params.toString();
	return query ? `${HOME}?${query}` : HOME;
}

/** Whether `filter` narrows the stream at all — the empty state differs when it does. */
export function isNarrowed(filter: StreamFilter): boolean {
	return filter.kind !== null || filter.memberId !== null || filter.tags.length > 0;
}

/**
 * A tag chip's target: an unchosen `tag` joins the chosen ones — a moment must then carry them
 * all — and narrows to moments; a chosen one is taken off, and the moments stay. The member it
 * is already narrowed to is kept.
 */
export function toggleTag(filter: StreamFilter, tag: string): StreamFilter {
	return filter.tags.includes(tag)
		? { ...filter, tags: filter.tags.filter((chosen) => chosen !== tag) }
		: { ...filter, kind: 'moment', tags: [...filter.tags, tag] };
}

/** Every tag taken off; the moments stay. */
export function withoutTags(filter: StreamFilter): StreamFilter {
	return { ...filter, tags: [] };
}

/** Home narrowed to `kind`: a kind other than moments has no tags, so it takes them off. */
export function withKind(filter: StreamFilter, kind: StreamKind | null): StreamFilter {
	return { ...filter, kind, tags: kind === 'moment' ? filter.tags : [] };
}

/** Fewest members for which "who did it" is a choice rather than a single chip. */
const MEMBERS_WORTH_A_CHOICE = 2;

/** Whether the "who" row earns its place: a household of one has nobody to tell apart. */
export function offersMemberChoice(members: readonly unknown[]): boolean {
	return members.length >= MEMBERS_WORTH_A_CHOICE;
}
