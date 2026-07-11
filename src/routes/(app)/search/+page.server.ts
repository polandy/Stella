import { redirect } from '@sveltejs/kit';
import { search } from '$lib/server/domain/search/search';
import { getSearchDeps } from '$lib/server/services';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(302, '/login');
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };

	const q = url.searchParams.get('q')?.trim() ?? '';
	const results = q ? await search(getSearchDeps(), viewer, q) : { contacts: [], notes: [] };
	return { q, results };
};
