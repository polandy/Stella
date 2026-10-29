import { requireViewer } from '$lib/server/auth/guards';
import { NOTHING_FOUND, search } from '$lib/server/domain/search/search';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const viewer = requireViewer(locals);

	const q = url.searchParams.get('q')?.trim() ?? '';
	const results = q ? await search(locals.services.household.searchDeps, viewer, q) : NOTHING_FOUND;
	return { q, results };
};
