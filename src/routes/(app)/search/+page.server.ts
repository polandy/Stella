import { requireViewer } from '$lib/server/auth/guards';
import { NOTHING_FOUND, search } from '$lib/server/domain/search/search';
import type { PageServerLoad } from './$types';
import { searchForView } from './search-view';

export const load: PageServerLoad = async ({ locals, url }) => {
	const viewer = requireViewer(locals);

	const q = url.searchParams.get('q')?.trim() ?? '';
	const found = q ? await search(locals.services.household.searchDeps, viewer, q) : NOTHING_FOUND;
	const results = await searchForView(locals.services.people.contactNameDeps, viewer, found, q);
	return { q, results };
};
