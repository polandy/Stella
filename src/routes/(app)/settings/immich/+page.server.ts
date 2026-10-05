import { error, fail, redirect } from '@sveltejs/kit';
import type { MessageKey } from '$lib/i18n/translate';
import type { ImmichFailure } from '$lib/server/domain/immich/gateway';
import { linkMatches, type ConfirmedMatch } from '$lib/server/domain/immich/links';
import { findImmichMatches } from '$lib/server/domain/immich/matching';
import { getImmichLinkDeps, getImmichMatchingDeps } from '$lib/server/services';
import { say, translator } from '$lib/server/i18n/say';
import type { Actions, PageServerLoad } from './$types';

/*
 * *Settings → Immich → Find your people* (docs/concepts/immich.md §4.2, docs/02 §2.24.7): every
 * person the viewer sees, next to the Immich face their name matches. Any member may use it — a
 * link is household data (§9.4). Without Immich it does not exist.
 *
 * The list is handed over as a promise: the page opens at once, and the rows arrive when Immich
 * has listed its people. A link changes nothing else on the page, so linking does not ask Immich
 * for the whole list again — the screen takes the linked rows away itself.
 */

/** What the page says when Immich gave no list. */
const FAILURE_MESSAGE: Record<ImmichFailure, MessageKey> = {
	unauthorized: 'immich.error.keyRejected',
	forbidden: 'immich.settings.scope.person.read',
	notFound: 'immich.error.unreachable',
	unreachable: 'immich.error.unreachable'
};

/** More pairs than any list shows at once; a post with more is not from this page. */
const MAX_PAIRS = 2000;

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');
	const deps = getImmichMatchingDeps();
	if (!deps) throw error(404, say(locals, 'errors.notFound'));
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };
	return {
		matches: findImmichMatches(deps, viewer).then((outcome) =>
			outcome.ok
				? { rows: outcome.rows, error: null }
				: { rows: [], error: say(locals, FAILURE_MESSAGE[outcome.failure]) }
		)
	};
};

/** The pairs a form posts: `contactId` and `immichPersonId`, repeated in step. */
function pairsOf(form: FormData): ConfirmedMatch[] | null {
	const contactIds = form.getAll('contactId');
	const personIds = form.getAll('immichPersonId');
	if (contactIds.length === 0 || contactIds.length !== personIds.length || contactIds.length > MAX_PAIRS) return null;
	const pairs: ConfirmedMatch[] = [];
	for (const [at, contactId] of contactIds.entries()) {
		const immichPersonId = personIds[at];
		if (typeof contactId !== 'string' || typeof immichPersonId !== 'string') return null;
		pairs.push({ contactId, immichPersonId });
	}
	return pairs;
}

/** One row's Link and *Link all likely* are the same action: a list of confirmed pairs. */
const linking: Actions[string] = async ({ request, locals }) => {
	if (!locals.user) throw redirect(302, '/login');
	const deps = getImmichLinkDeps();
	if (!deps) throw error(404, say(locals, 'errors.notFound'));
	const pairs = pairsOf(await request.formData());
	if (!pairs) return fail(400, { linked: [], refused: [], error: say(locals, 'errors.notFound') });

	const result = await linkMatches(deps, { userId: locals.user.id, householdId: locals.user.householdId }, pairs);
	const refusedIds = new Set(result.refused.map((r) => r.contactId));
	const t = translator(locals);
	return {
		linked: pairs.map((p) => p.contactId).filter((id) => !refusedIds.has(id)),
		refused: result.refused.map((r) => ({ contactId: r.contactId, message: r.error.phrase(t) })),
		error: null
	};
};

export const actions: Actions = { link: linking, linkAll: linking };
