import { error } from '@sveltejs/kit';
import { answerMatchHint } from '$lib/server/immich/routes';
import { say } from '$lib/server/i18n/say';
import type { RequestHandler } from './$types';

/*
 * The face the Photos card suggests for an unlinked person (docs/02 §2.24.7), asked for after the
 * page has loaded, so reading all of Immich's people never holds the page up. What it answers is
 * decided and tested in `$lib/server/immich/routes.ts`; this only wires it.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	const viewer = locals.user ? { id: locals.user.id, householdId: locals.user.householdId } : null;
	const answer = await answerMatchHint(
		locals.services.immich?.immichMatchingDeps ?? null,
		viewer,
		params.id
	);
	if (answer instanceof Response) return answer;
	throw error(answer.status, say(locals, answer.message));
};
