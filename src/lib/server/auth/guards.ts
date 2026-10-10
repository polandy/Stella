import { error, redirect } from '@sveltejs/kit';
import type { Viewer } from '../access/visibility';
import { say } from '../i18n/say';
import type { AuthUser } from './accounts';

/*
 * Route guards for the SvelteKit edge — one line per route instead of a hand-written check.
 * An anonymous visitor is sent to the login page (the `(app)` layout already does this, so
 * here it is mostly the narrowing a route needs; the redirect keeps a form action that is
 * posted to directly from answering with a crash). Admin-only surfaces (docs/02 §2.17
 * "Data") answer 403 to a signed-in member rather than hiding — the page exists, it is just
 * not theirs to use.
 */

/** The whole signed-in account, for a route that reads more than who is asking. */
export function requireUser(locals: Pick<App.Locals, 'user'>): AuthUser {
	if (!locals.user) throw redirect(302, '/login');
	return locals.user;
}

/** Who is asking, as the access layer takes it (docs/03 §3.7). */
export function requireViewer(locals: Pick<App.Locals, 'user'>): Viewer {
	const { id, householdId } = requireUser(locals);
	return { id, householdId };
}

/** The signed-in admin, or a redirect to login / a 403 for members, in their language. */
export function requireAdmin(locals: Pick<App.Locals, 'user' | 'locale'>): AuthUser {
	const user = requireUser(locals);
	if (user.role !== 'admin') throw error(403, say(locals, 'errors.admin.only'));
	return user;
}
