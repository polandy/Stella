import { error } from '@sveltejs/kit';
import { answerFaceThumbnail } from '$lib/server/immich/routes';
import { getImmich } from '$lib/server/services';
import { say } from '$lib/server/i18n/say';
import type { RequestHandler } from './$types';

/*
 * A face from Immich, through Stella (docs/concepts/immich.md §2 point 3, docs/02 §2.24.4): the
 * browser never reaches Immich and the key never leaves the server. What it answers is decided
 * and tested in `$lib/server/immich/routes.ts`; this only wires it.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	const viewer = locals.user ? { id: locals.user.id, householdId: locals.user.householdId } : null;
	const answer = await answerFaceThumbnail(getImmich(), viewer, params.personId);
	if (answer instanceof Response) return answer;
	throw error(answer.status, say(locals, answer.message));
};
