import { redirect } from '@sveltejs/kit';
import { getGraphRepository } from '$lib/server/services';
import { chooseCenter } from './center';
import type { PageServerLoad } from './$types';

/*
 * Explorer route (docs/02 §2.7). The server sends the whole *visible* graph once as a slim,
 * access-scoped snapshot; the browser then builds the ego view, expands, focuses, and traces
 * paths entirely client-side (no per-interaction round-trips). `?center=<contactId>` opens on
 * that person (the profile's "Explore connections" entry) — falling back to the member's own
 * person (docs/02 §2.1.3), and to the first visible one while they have not said who that is.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(302, '/login');
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };

	const graph = await getGraphRepository().loadVisibleGraph(viewer);
	const centerId = chooseCenter(
		graph.nodes,
		url.searchParams.get('center'),
		locals.user.selfContactId
	);

	return { graph, centerId };
};
