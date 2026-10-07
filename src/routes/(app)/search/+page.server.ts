import { requireViewer } from '$lib/server/auth/guards';
import { search } from '$lib/server/domain/search/search';
import { getSearchDeps } from '$lib/server/services';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const viewer = requireViewer(locals);

	const q = url.searchParams.get('q')?.trim() ?? '';
	const results = q ? await search(getSearchDeps(), viewer, q) : { contacts: [], notes: [] };
	return { q, results };
};
