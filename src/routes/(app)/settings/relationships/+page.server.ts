import { fail, redirect } from '@sveltejs/kit';
import { groupBySubject, type SubjectGroup } from '$lib/suggestions/grouping';
import { authorNames } from '$lib/server/domain/household/members';
import {
	reviewHousehold,
	type ProposedLink
} from '$lib/server/domain/relationships/suggestion-review';
import {
	acceptClaim,
	declineClaim,
	restoreClaim
} from '$lib/server/relationships/suggestion-answers';
import { getMemberDeps, getSuggestionReviewDeps } from '$lib/server/services';
import { translator } from '$lib/server/i18n/say';
import type { Actions, PageServerLoad } from './$types';

/*
 * The household-wide relationship review (docs/02 §2.4.1,
 * docs/concepts/relationship-suggestions.md §6.6).
 *
 * The person page asks what stands around *one* person, which only ever reaches the people
 * somebody thought to open. This asks about everyone the viewer can see, in one pass, because
 * a household that entered or imported its links years ago has opened none of them.
 *
 * Not admin-only: the dismissal log belongs to the household, any member sees the same answers
 * and any member may take one back (docs/03 §3.9). What it lists is scoped to the viewer's
 * graph like everything else, so two members can see different families and neither can be
 * told about a person they may not see.
 */

/** The pass hangs on the URL, so it survives a reload and no rule runs until it is asked for. */
const REVIEW_PARAM = 'review';

/** Back to the list with the pass still open — where every answer returns to. */
const REVIEW_PATH = `/settings/relationships?${REVIEW_PARAM}`;

/** What the screen reads, closed or open, so both states carry the same shape. */
interface ReviewPage {
	open: boolean;
	groups: SubjectGroup<SaidSuggestion>[];
	declined: SaidSuggestion[];
	openCount: number;
	declinedCount: number;
	/** The member behind each declined row, for the trail the drawer shows. */
	memberNames: Record<string, string | null>;
}

/** A suggestion whose reason has stopped being a `Phrase` and become a sentence. */
type SaidSuggestion = Omit<ProposedLink, 'reason'> & { reason: string };

const NOTHING_CHECKED: ReviewPage = {
	open: false,
	groups: [],
	declined: [],
	openCount: 0,
	declinedCount: 0,
	memberNames: {}
};

export const load: PageServerLoad = async ({ locals, url }): Promise<ReviewPage> => {
	if (!locals.user) throw redirect(302, '/login');
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };

	// Closed, the page costs a session lookup and nothing else: the rules run on request.
	if (!url.searchParams.has(REVIEW_PARAM)) return NOTHING_CHECKED;

	const [found, nameOfAuthor] = await Promise.all([
		reviewHousehold(getSuggestionReviewDeps(), viewer, { includeDismissed: true }),
		authorNames(getMemberDeps(), viewer.householdId)
	]);
	// The reason arrives as a `Phrase`; here is where it becomes a sentence, in the language
	// this request is being read in.
	const said: SaidSuggestion[] = found.map((s) => ({ ...s, reason: s.reason(translator(locals)) }));
	const standing = said.filter((s) => s.dismissed === null);
	const declined = said.filter((s) => s.dismissed !== null);

	return {
		open: true,
		groups: groupBySubject(standing),
		declined,
		openCount: standing.length,
		declinedCount: declined.length,
		// Only the members a declined row actually names — the drawer says who said no.
		memberNames: Object.fromEntries(
			declined.map((s) => [s.dismissed!.by, nameOfAuthor(s.dismissed!.by)])
		)
	};
};

/*
 * The three answers, all of them the shared ones (`suggestion-answers.ts`): the same claim
 * answered here and on a person page must mean the same thing, so only the way back differs.
 */
export const actions: Actions = {
	addProposedRelationship: async ({ request, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };
		const refusal = await acceptClaim(locals, viewer, await request.formData());
		if (refusal) return fail(refusal.status, { error: refusal.message });
		throw redirect(303, REVIEW_PATH);
	},

	dismissSuggestion: async ({ request, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };
		const refusal = await declineClaim(locals, viewer, await request.formData());
		if (refusal) return fail(refusal.status, { error: refusal.message });
		throw redirect(303, REVIEW_PATH);
	},

	restoreSuggestion: async ({ request, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };
		const refusal = await restoreClaim(locals, viewer, await request.formData());
		if (refusal) return fail(refusal.status, { error: refusal.message });
		throw redirect(303, REVIEW_PATH);
	}
};
