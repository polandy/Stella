import { error } from '@sveltejs/kit';
import { answerImmichMemories } from '$lib/server/immich/memories-route';
import { say } from '$lib/server/i18n/say';
import type { RequestHandler } from './$types';

/*
 * *On this day* from Immich (`?day=YYYY-MM-DD`, and for *Show more* `&year=&from=`), loaded by
 * Home's band and `/on-this-day` after they are drawn (docs/02 §2.12.1). What it answers is
 * decided and tested in `$lib/server/immich/memories-route.ts`; this only wires it.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const viewer = locals.user ? { id: locals.user.id, householdId: locals.user.householdId } : null;
	const answer = await answerImmichMemories(
		locals.services.immich?.immichMemoryDeps ?? null,
		viewer,
		{
			day: url.searchParams.get('day'),
			year: url.searchParams.get('year'),
			from: url.searchParams.get('from')
		}
	);
	if (answer instanceof Response) return answer;
	throw error(answer.status, say(locals, answer.message));
};
