import { error, redirect } from '@sveltejs/kit';
import type { AuthUser } from './accounts';

/*
 * Route guards for the SvelteKit edge. Admin-only surfaces (docs/02 §2.17 "Data") answer 403
 * to a signed-in member rather than hiding — the page exists, it is just not theirs to use.
 */

/** The signed-in admin, or a redirect to login / a 403 for members. */
export function requireAdmin(locals: App.Locals): AuthUser {
	if (!locals.user) throw redirect(302, '/login');
	if (locals.user.role !== 'admin') throw error(403, 'Only an admin can do this.');
	return locals.user;
}
