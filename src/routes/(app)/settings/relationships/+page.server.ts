import { fail, redirect } from '@sveltejs/kit';
import {
	DECLINED_PER_PAGE,
	declinedFitsInline,
	declinedKey,
	orderedDeclined,
	pageOf,
	reviewPage,
	type FoldedGroup
} from '$lib/suggestions/paging';
import {
	RETURN_TO_FIELD,
	returnedTo,
	reviewHref,
	reviewIsOpen,
	reviewLocationFrom,
	reviewQuery,
	type ReviewLocation
} from '$lib/relationships/review-url';
import { authorNames } from '$lib/server/domain/household/members';
import {
	reviewHousehold,
	type ProposedLink
} from '$lib/server/domain/relationships/suggestion-review';
import {
	acceptClaim,
	declineClaim,
	restoreClaim,
	type RefusedAnswer
} from '$lib/server/relationships/suggestion-answers';
import { getMemberDeps, getSuggestionReviewDeps } from '$lib/server/services';
import { translator } from '$lib/server/i18n/say';
import type { Actions, PageServerLoad } from './$types';

/*
 * The household-wide relationship review (docs/02 §2.4.1,
 * docs/concepts/relationship-suggestions.md §6.6), folded for scale in
 * docs/concepts/relationship-review-at-scale.html.
 *
 * The person page asks what stands around *one* person, which only ever reaches the people
 * somebody thought to open. This asks about everyone the viewer can see, in one pass, because
 * a household that entered or imported its links years ago has opened none of them.
 *
 * The engine computes all of it — there is no cap (docs/04 §4.9) — so what this route does is
 * fold: a page of people, a few claims per person, and the declined log behind its own address
 * once it outgrows a drawer. Every total handed to the screen is taken *before* the slice and
 * describes the household; only the range and `matched` follow the search. Mixing those two is
 * the one way this screen lies, which is why the totals come out of `reviewPage` rather than
 * being counted off whatever ended up on the page.
 *
 * Not admin-only: the dismissal log belongs to the household, any member sees the same answers
 * and any member may take one back (docs/03 §3.9). What it lists is scoped to the viewer's
 * graph like everything else, so two members can see different families and neither can be
 * told about a person they may not see.
 */

/** A suggestion whose reason has stopped being a `Phrase` and become a sentence. */
type SaidSuggestion = Omit<ProposedLink, 'reason'> & { reason: string };

/** What the screen reads, in every state, so they all carry the same shape. */
interface ReviewData {
	open: boolean;
	/** The declined log rather than the open list. */
	log: boolean;
	groups: FoldedGroup<SaidSuggestion>[];
	/** The declined rows to render: the whole drawer inline, or this page of the log. */
	declined: SaidSuggestion[];
	/** The log still fits inside the list; false once it has earned its own page. */
	declinedInline: boolean;
	/** Open claims across the household — never this page's count. */
	openCount: number;
	/** People carrying at least one open claim, household-wide. */
	peopleCount: number;
	/** Declined claims the household has on record, household-wide. */
	declinedCount: number;
	/** Rows the current search matches; what `from`–`to` is measured against. */
	matched: number;
	from: number;
	to: number;
	/** Where the pager's two links point, already built. */
	next: string | null;
	previous: string | null;
	query: string;
	/** This page's own query string, which every answer form carries back. */
	returnTo: string;
	/** The member behind each declined row, for the trail the log shows. */
	memberNames: Record<string, string | null>;
}

const NOTHING_CHECKED: ReviewData = {
	open: false,
	log: false,
	groups: [],
	declined: [],
	declinedInline: true,
	openCount: 0,
	peopleCount: 0,
	declinedCount: 0,
	matched: 0,
	from: 0,
	to: 0,
	next: null,
	previous: null,
	query: '',
	returnTo: '',
	memberNames: {}
};

/** The pager's two links, or null at either end of whichever list is being walked. */
const linksFor = (
	page: { nextCursor: string | null; previousCursor: string | null },
	href: (cursor: ReviewLocation) => string
) => ({
	next: page.nextCursor === null ? null : href({ after: page.nextCursor, before: null }),
	previous: page.previousCursor === null ? null : href({ before: page.previousCursor, after: null })
});

export const load: PageServerLoad = async ({ locals, url }): Promise<ReviewData> => {
	if (!locals.user) throw redirect(302, '/login');
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };

	// Closed, the page costs a session lookup and nothing else: the rules run on request.
	if (!reviewIsOpen(url.searchParams)) return NOTHING_CHECKED;

	const at = reviewLocationFrom(url.searchParams);
	const [found, nameOfAuthor] = await Promise.all([
		reviewHousehold(getSuggestionReviewDeps(), viewer, { includeDismissed: true }),
		authorNames(getMemberDeps(), viewer.householdId)
	]);
	// The reason arrives as a `Phrase`; here is where it becomes a sentence, in the language
	// this request is being read in.
	const said: SaidSuggestion[] = found.map((s) => ({ ...s, reason: s.reason(translator(locals)) }));
	const standing = said.filter((s) => s.dismissed === null);
	const declined = orderedDeclined(said.filter((s) => s.dismissed !== null));
	const declinedInline = declinedFitsInline(declined.length);

	// One fold is walked at a time, so both pagers read the same two cursor parameters.
	const cursor = { after: at.after, before: at.before };
	const list = reviewPage(standing, at.declined ? {} : cursor, { query: at.query ?? '' });
	const log = pageOf(declined, declinedKey, DECLINED_PER_PAGE, at.declined ? cursor : {});
	const shown = at.declined ? log.items : declinedInline ? declined : [];
	const walking = at.declined ? log : list;

	return {
		open: true,
		log: at.declined === true,
		groups: at.declined ? [] : list.groups,
		declined: shown,
		declinedInline,
		openCount: standing.length,
		peopleCount: list.people,
		declinedCount: declined.length,
		matched: at.declined ? log.total : list.matched,
		from: walking.from,
		to: walking.to,
		...linksFor(walking, (cursorValue) => reviewHref({ ...at, ...cursorValue })),
		query: at.query ?? '',
		returnTo: reviewQuery(at),
		// Only the members a declined row actually names — the log says who said no.
		memberNames: Object.fromEntries(
			shown.map((s) => [s.dismissed!.by, nameOfAuthor(s.dismissed!.by)])
		)
	};
};

/*
 * The three answers, all of them the shared ones (`suggestion-answers.ts`): the same claim
 * answered here and on a person page must mean the same thing, so only the way back differs.
 *
 * Each returns to the place the member answered from — same page, same search. That place
 * arrives in the body rather than on the URL: a form action resolves against the current
 * address, so `?/dismissSuggestion` replaces the query string and the cursor never reaches the
 * server. Sending a member back to the top of a ninety-person list on every answer is how a
 * list stops being finishable.
 */
type Answer = (
	locals: App.Locals,
	viewer: { id: string; householdId: string },
	form: FormData
) => Promise<RefusedAnswer | null>;

/** One answer, applied and then returned from — the three differ only in which one they call. */
const answering =
	(answer: Answer): Actions[string] =>
	async ({ request, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };
		const form = await request.formData();
		const refusal = await answer(locals, viewer, form);
		if (refusal) return fail(refusal.status, { error: refusal.message });
		throw redirect(303, returnedTo(form.get(RETURN_TO_FIELD)));
	};

export const actions: Actions = {
	addProposedRelationship: answering(acceptClaim),
	dismissSuggestion: answering(declineClaim),
	restoreSuggestion: answering(restoreClaim)
};
