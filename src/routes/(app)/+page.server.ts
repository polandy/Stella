import { redirect } from '@sveltejs/kit';
import { buildDashboard } from '$lib/server/domain/dashboard/dashboard';
import { getDashboardDeps } from '$lib/server/services';
import type { PageServerLoad } from './$types';

/*
 * Personal dashboard / home (docs/02 §2.12). Composes recent, access-scoped household life for
 * the signed-in member. The layout guard already ensures `locals.user`.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };
	return { dashboard: await buildDashboard(getDashboardDeps(), viewer) };
};
