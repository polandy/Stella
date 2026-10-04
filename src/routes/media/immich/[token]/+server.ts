import { error } from '@sveltejs/kit';
import { answerImmichMedia } from '$lib/server/immich/routes';
import { getImmichMediaDeps } from '$lib/server/services';
import { say } from '$lib/server/i18n/say';
import type { RequestHandler } from './$types';

/*
 * Every image from Immich, through Stella (docs/concepts/immich.md §5, docs/02 §2.24.5): a face
 * in the picker, a photo in the strip or the viewer, each for a token Stella signed. The browser
 * never reaches Immich and the key never leaves the server. What it answers is decided and
 * tested in `$lib/server/immich/routes.ts`; this only wires it.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	const viewer = locals.user ? { id: locals.user.id, householdId: locals.user.householdId } : null;
	const answer = await answerImmichMedia(getImmichMediaDeps(), viewer, params.token);
	if (answer instanceof Response) return answer;
	throw error(answer.status, say(locals, answer.message));
};
