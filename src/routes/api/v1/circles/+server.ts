import { json } from '@sveltejs/kit';
import { unauthorized } from '$lib/server/api/responses';
import { findCircles } from '$lib/server/domain/import/api/lookup';
import { getCircleDeps } from '$lib/server/services';
import type { RequestHandler } from './$types';

/*
 * `GET /api/v1/circles?q=…` (docs/02 §2.16.1): the circles the member may see whose name
 * contains the query, or all of them without one.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const user = locals.user;
	if (!user) return unauthorized();
	const viewer = { id: user.id, householdId: user.householdId };
	return json({
		circles: await findCircles(getCircleDeps(), viewer, url.searchParams.get('q') ?? '')
	});
};
