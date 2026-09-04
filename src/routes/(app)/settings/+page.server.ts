import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Settings landing (docs/02 §2.17). Only the admin "Data" section exists so far. */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');
	return { isAdmin: locals.user.role === 'admin' };
};
