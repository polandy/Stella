import { redirect } from '@sveltejs/kit';
import { getGraphRepository } from '$lib/server/services';
import { chooseCenter } from './center';
import type { PageServerLoad } from './$types';

/*
 * Explorer route (docs/02 §2.7). The server sends the whole *visible* graph once as a slim,
 * access-scoped snapshot; the browser then builds the ego view, expands, focuses, and traces
 * paths entirely client-side (no per-interaction round-trips). `?center=<contactId>` opens on
 * that person (the profile's "Open in the graph" button) — falling back to the member's own
 * person (docs/02 §2.1.3), and to the first visible one while they have not said who that is.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(302, '/login');
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };

	const graph = await getGraphRepository().loadVisibleGraph(viewer);
	const center = chooseCenter(
		graph.nodes,
		url.searchParams.get('center'),
		locals.user.selfContactId
	);

	/*
	 * A profile links here with its own person (docs/05 §5.5), so the way back belongs on the
	 * page: without it the only route back to the person you were reading is the browser's own
	 * button. The name comes from the snapshot that is already loaded — no second query — and
	 * it is offered only for a centre a link actually asked for.
	 */
	const cameFrom =
		center.asked && center.id
			? (graph.nodes.find((node) => node.id === center.id)?.label ?? null)
			: null;

	return { graph, centerId: center.id, cameFrom };
};
