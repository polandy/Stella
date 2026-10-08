import { requireViewer } from '$lib/server/auth/guards';
import { search } from '$lib/server/domain/search/search';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const viewer = requireViewer(locals);

	const q = url.searchParams.get('q')?.trim() ?? '';
	const results = q
		? await search(locals.services.household.searchDeps, viewer, q)
		: { contacts: [], notes: [], gifts: [] };
	return { q, results };
};
