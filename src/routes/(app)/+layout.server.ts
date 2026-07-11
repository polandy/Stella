import { redirect } from '@sveltejs/kit';
import { getAccounts } from '$lib/server/services';
import type { LayoutServerLoad } from './$types';

/*
 * Guard for the authenticated app. Unauthenticated visitors are sent to setup (when no
 * account exists yet) or to login. See docs/02 §2.1.
 */

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) {
		const hasUsers = (await getAccounts().countUsers()) > 0;
		throw redirect(302, hasUsers ? '/login' : '/setup');
	}
	return { user: locals.user };
};
