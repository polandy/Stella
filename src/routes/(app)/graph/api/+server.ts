import { error, json } from '@sveltejs/kit';
import { getGraphDataSource } from '$lib/server/services';
import type { RequestHandler } from './$types';

/*
 * Neighbourhood endpoint for the explorer (docs/04 §4.11). The in-browser GraphDataSource
 * (http-source.ts) calls this for live expansion and path search, so the same pure builders
 * run client- and server-side. Access scoping is applied here; an invisible or missing node
 * returns 404, which the client maps to null — existence is never revealed (docs/03 §3.7).
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Not signed in');

	const id = url.searchParams.get('id');
	if (!id) throw error(400, 'Missing id');

	const viewer = { id: locals.user.id, householdId: locals.user.householdId };
	const neighborhood = await getGraphDataSource(viewer).neighborhood(id);
	if (!neighborhood) return json(null, { status: 404 });

	return json(neighborhood);
};
