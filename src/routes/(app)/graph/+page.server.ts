import { redirect } from '@sveltejs/kit';
import { getGraphRepository } from '$lib/server/services';
import type { PageServerLoad } from './$types';

/*
 * Explorer route (docs/02 §2.7). The server sends the whole *visible* graph once as a slim,
 * access-scoped snapshot; the browser then builds the ego view, expands, focuses, and traces
 * paths entirely client-side (no per-interaction round-trips). `?center=<contactId>` opens on
 * that person (the profile's "Explore connections" entry) — falling back to the first visible
 * person if it isn't given or isn't visible.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(302, '/login');
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };

	const graph = await getGraphRepository().loadVisibleGraph(viewer);
	const nodeIds = new Set(graph.nodes.map((n) => n.id));

	const requested = url.searchParams.get('center');
	const centerId =
		requested && nodeIds.has(requested)
			? requested
			: graph.nodes.find((n) => n.kind === 'person')?.id ?? null;

	return { graph, centerId };
};
