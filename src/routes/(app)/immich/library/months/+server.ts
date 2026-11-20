import { error } from '@sveltejs/kit';
import { answerLibraryMonths } from '#lib/server/immich/routes.js';
import { say } from '#lib/server/i18n/say.js';
import type { RequestHandler } from './$types';

/*
 * The Immich timeline's months, for the photo picker's years overview (docs/dev/02 §2.24.9).
 * What it answers is decided and tested in `#lib/server/immich/routes.ts`; this only wires it.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const viewer = locals.user ? { id: locals.user.id, householdId: locals.user.householdId } : null;
	const answer = await answerLibraryMonths(
		locals.services.immich?.immichLibraryDeps ?? null,
		viewer
	);
	if (answer instanceof Response) return answer;
	throw error(answer.status, say(locals, answer.message));
};
