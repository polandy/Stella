import { groupBySubject, type NamedClaim, type SubjectGroup } from './grouping';

/*
 * Paging and folding a review (docs/concepts/relationship-review-at-scale.html, docs/04 §4.9).
 *
 * The engine computes everything a household's graph implies — there is no cap, deliberately.
 * What has to stay finite is the *screen*, and the rule the whole module follows is: nothing is
 * dropped, everything is folded. A cap removes claims and lies about the total; a fold renders
 * fewer rows and keeps the number honest, with one link to the rest.
 *
 * Two folds live here — the page of people, and the claims inside one person's group — and both
 * are pure functions over an already-computed result. Paging deliberately does not reach into
 * the engine: the rule set stays the one place that decides what a relationship is, and this
 * stays testable without a graph, a viewer or a browser.
 */

/**
 * People per page. Measured rather than guessed: at 25 the prototype came to 44 rows and
 * 6,115px — 9.3 phone screens, the wall the fold exists to remove — while 10 is 17 rows and
 * 2,401px, a list somebody finishes (concept, *Open questions*).
 */
export const PEOPLE_PER_PAGE = 10;

/** Claims rendered per person before the rest is folded behind a link to their page. */
export const CLAIMS_PER_GROUP = 5;

/** Declined claims per page once the log has outgrown its inline drawer. */
export const DECLINED_PER_PAGE = 20;

/** Above this many, the declined log stops being a drawer in the list and becomes its own page. */
export const DECLINED_INLINE_MAX = 10;

/**
 * Whether the declined log still fits inside the list. Past the threshold it is not a drawer
 * any more but a second list competing with the one the member came to work through, so it
 * moves to its own address — it is history rather than work.
 */
export const declinedFitsInline = (count: number): boolean => count <= DECLINED_INLINE_MAX;

/**
 * Separator inside a composite sort key, and the reason a cursor survives a URL.
 *
 * Ids are ULIDs (docs/03 §3.1) — Crockford base32, so an id can never contain this
 * character. That is what keeps two keys unambiguous even when a *name* contains one, and it
 * lets the cursor travel in a query string as itself rather than as an encoded control byte.
 */
const KEY_SEPARATOR = '|';

/**
 * Where a page starts. One of the two at most: `after` is the key of the last row of the
 * previous page, `before` the key of the first row of the next one.
 *
 * A key rather than an offset, because the list shrinks while it is being answered: between
 * rendering a page and following its *next* link, the rows the reader just settled are gone,
 * and an offset would step over exactly as many rows as they answered.
 */
export interface Cursor {
	after?: string | null;
	before?: string | null;
}

/** One page of an ordered list, with the totals of the list it was cut from. */
export interface Page<T> {
	items: T[];
	/** Rows in the whole list, not on this page. */
	total: number;
	/** 1-based position of the first row shown, or 0 when there is nothing to show. */
	from: number;
	/** 1-based position of the last row shown, or 0 when there is nothing to show. */
	to: number;
	/** Pass as `after` for the following page; null on the last one. */
	nextCursor: string | null;
	/** Pass as `before` for the preceding page; null on the first one. */
	previousCursor: string | null;
}

/**
 * One page out of `items`, which must already be ordered by `keyOf` ascending under the same
 * `<` comparison used here — a locale-aware sort with a code-unit cursor comparison pages
 * correctly on one machine and skips rows on another.
 *
 * A cursor that has outlived the list (everything left sorts before it) lands on the last page
 * rather than on an empty one: the rows it pointed at were answered away, and an empty screen
 * would read as "nothing left" when there is plenty.
 */
export function pageOf<T>(
	items: readonly T[],
	keyOf: (item: T) => string,
	size: number,
	cursor: Cursor = {}
): Page<T> {
	const total = items.length;
	let start = 0;
	if (cursor.after) {
		const after = cursor.after;
		const found = items.findIndex((item) => keyOf(item) > after);
		start = found < 0 ? Math.max(0, total - size) : found;
	} else if (cursor.before) {
		const before = cursor.before;
		const found = items.findIndex((item) => keyOf(item) >= before);
		start = Math.max(0, (found < 0 ? total : found) - size);
	}

	const page = items.slice(start, start + size);
	const end = start + page.length;
	return {
		items: page,
		total,
		from: page.length === 0 ? 0 : start + 1,
		to: end,
		nextCursor: end < total && page.length > 0 ? keyOf(page[page.length - 1]!) : null,
		previousCursor: start > 0 && page.length > 0 ? keyOf(page[0]!) : null
	};
}

/** A subject's claims, cut to what is rendered, with the number the rules actually found. */
export interface FoldedGroup<T extends NamedClaim> extends SubjectGroup<T> {
	/** Claims about this person in total — always the full count, never the rendered one. */
	totalSuggestions: number;
}

/**
 * Folds a group to `limit` rendered claims. One imported family or a sibling group of twelve
 * can leave dozens of claims about a single person; five of them are enough to recognise what
 * the rules are proposing, and the count is what makes the fold honest.
 */
export function foldGroup<T extends NamedClaim>(
	group: SubjectGroup<T>,
	limit: number = CLAIMS_PER_GROUP
): FoldedGroup<T> {
	return {
		...group,
		suggestions: group.suggestions.slice(0, limit),
		totalSuggestions: group.suggestions.length
	};
}

/** The key a group is ordered and paged by: display name first, id to break every tie. */
export const subjectKey = (group: SubjectGroup<NamedClaim>): string =>
	`${group.subjectName}${KEY_SEPARATOR}${group.subjectId}`;

/**
 * Groups claims by subject and puts them in the total order paging depends on. The engine's own
 * order is by confidence and rule, which is right inside a group and useless between two of
 * them — a cursor needs an order that is the same on the next request.
 */
export function orderedGroups<T extends NamedClaim>(claims: readonly T[]): SubjectGroup<T>[] {
	return groupBySubject(claims).sort((a, b) => {
		const left = subjectKey(a);
		const right = subjectKey(b);
		return left < right ? -1 : left > right ? 1 : 0;
	});
}

/** One page of a review: the groups to render, and the totals that describe the household. */
export interface ReviewPage<T extends NamedClaim> extends Omit<Page<FoldedGroup<T>>, 'items' | 'total'> {
	groups: FoldedGroup<T>[];
	/** People with at least one open claim, household-wide. Never this page's count. */
	people: number;
	/** Open claims household-wide, counted before anything was folded or sliced. */
	openClaims: number;
	/** People the current search matches — what the pager's range is measured against. */
	matched: number;
}

/**
 * The household review, cut to one page.
 *
 * The totals are taken before the slice and describe the household; only `matched` and the
 * range follow the search. Keeping those two apart is the one way this design goes wrong, so
 * it is a property of this function rather than a habit of a component.
 */
export function reviewPage<T extends NamedClaim>(
	claims: readonly T[],
	cursor: Cursor = {},
	options: { query?: string } = {}
): ReviewPage<T> {
	const all = orderedGroups(claims);
	const query = options.query?.trim().toLowerCase() ?? '';
	const matching = query
		? all.filter((group) => group.subjectName.toLowerCase().includes(query))
		: all;

	const page = pageOf(matching, subjectKey, PEOPLE_PER_PAGE, cursor);
	return {
		groups: page.items.map((group) => foldGroup(group)),
		people: all.length,
		openClaims: claims.length,
		matched: page.total,
		from: page.from,
		to: page.to,
		nextCursor: page.nextCursor,
		previousCursor: page.previousCursor
	};
}

/** A claim the household has answered with a *no*, as the log lists it. */
export interface DeclinedClaim extends NamedClaim {
	dismissed: { at: number; by: string } | null;
}

/**
 * How old an answer can be and still sort. Wide enough for any timestamp a clock produces, and
 * fixed so every key is the same width — a shorter number must not sort before a longer one.
 */
const TIMESTAMP_WIDTH = 16;

/**
 * The key the declined log is ordered and paged by.
 *
 * The log reads newest first, but a cursor compares with `<`, so the timestamp is inverted:
 * the most recent answer gets the smallest key. The pair follows, to break a tie between two
 * claims declined in the same millisecond.
 */
export function declinedKey(claim: DeclinedClaim): string {
	const at = claim.dismissed?.at ?? 0;
	const newestFirst = String(Number.MAX_SAFE_INTEGER - at).padStart(TIMESTAMP_WIDTH, '0');
	return [newestFirst, claim.relation, claim.fromId, claim.toId].join(KEY_SEPARATOR);
}

/** The declined log in the order it is read and paged: the most recent answer first. */
export function orderedDeclined<T extends DeclinedClaim>(claims: readonly T[]): T[] {
	return [...claims].sort((a, b) => {
		const left = declinedKey(a);
		const right = declinedKey(b);
		return left < right ? -1 : left > right ? 1 : 0;
	});
}
