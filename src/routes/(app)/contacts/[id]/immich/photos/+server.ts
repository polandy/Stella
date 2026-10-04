import { error } from '@sveltejs/kit';
import { answerGlimpse } from '$lib/server/immich/routes';
import { getImmichGlimpseDeps } from '$lib/server/services';
import { say } from '$lib/server/i18n/say';
import type { RequestHandler } from './$types';

/*
 * A page of the strip of a linked person's latest photos from Immich (docs/concepts/immich.md
 * §4.3, docs/02 §2.24.3), from `?cursor=` on. Fetched after the page, so a slow Immich never
 * holds the page up. What it answers is decided and tested in `$lib/server/immich/routes.ts`;
 * this only wires it.
 */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	const viewer = locals.user ? { id: locals.user.id, householdId: locals.user.householdId } : null;
	const answer = await answerGlimpse(getImmichGlimpseDeps(), viewer, params.id, url.searchParams.get('cursor'));
	if (answer instanceof Response) return answer;
	throw error(answer.status, say(locals, answer.message));
};
