import { json } from '@sveltejs/kit';
import { unauthorized } from '$lib/server/api/responses';
import { findPeople } from '$lib/server/domain/import/api/lookup';
import { getSearchDeps } from '$lib/server/services';
import type { RequestHandler } from './$types';

/*
 * `GET /api/v1/people?q=…` (docs/02 §2.16.1): the people the member may see whose name or
 * description matches — how a script finds the id to name as `existingId`.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const user = locals.user;
	if (!user) return unauthorized();
	const viewer = { id: user.id, householdId: user.householdId };
	return json({
		people: await findPeople(getSearchDeps(), viewer, url.searchParams.get('q') ?? '')
	});
};
