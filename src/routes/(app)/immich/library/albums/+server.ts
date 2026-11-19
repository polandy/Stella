import { error } from '@sveltejs/kit';
import { answerLibraryAlbums } from '$lib/server/immich/routes';
import { say } from '$lib/server/i18n/say';
import type { RequestHandler } from './$types';

/*
 * The Immich albums, own and shared, for the photo picker's album list (docs/dev/02 §2.24.9).
 * What it answers is decided and tested in `$lib/server/immich/routes.ts`; this only wires it.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const viewer = locals.user ? { id: locals.user.id, householdId: locals.user.householdId } : null;
	const answer = await answerLibraryAlbums(
		locals.services.immich?.immichLibraryDeps ?? null,
		viewer
	);
	if (answer instanceof Response) return answer;
	throw error(answer.status, say(locals, answer.message));
};
