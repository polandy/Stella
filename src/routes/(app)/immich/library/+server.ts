import { error } from '@sveltejs/kit';
import { answerLibrary } from '$lib/server/immich/routes';
import { say } from '$lib/server/i18n/say';
import type { RequestHandler } from './$types';

/*
 * A day of the whole Immich library (`?day=YYYY-MM-DD`), a search of it by description (`?q=`),
 * or a page of a month (`?month=YYYY-MM&cursor=`) or an album (`?album=&cursor=`), for the picker beside every photo upload (docs/dev/02 §2.24.9). What it answers is decided
 * and tested in `$lib/server/immich/routes.ts`; this only wires it.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const viewer = locals.user ? { id: locals.user.id, householdId: locals.user.householdId } : null;
	const answer = await answerLibrary(locals.services.immich?.immichLibraryDeps ?? null, viewer, {
		day: url.searchParams.get('day'),
		q: url.searchParams.get('q'),
		month: url.searchParams.get('month'),
		album: url.searchParams.get('album'),
		cursor: url.searchParams.get('cursor')
	});
	if (answer instanceof Response) return answer;
	throw error(answer.status, say(locals, answer.message));
};
