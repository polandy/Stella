import type { Handle } from '@sveltejs/kit';
import { clearSessionCookie, SESSION_COOKIE } from '$lib/server/auth/cookies';
import { validateSessionToken } from '$lib/server/auth/session';
import { getAccounts, getSessionDeps } from '$lib/server/services';

/*
 * Request entry point (docs/04 §4.4). Resolves the session cookie to `locals.user` and
 * sets baseline security headers. Route protection lives in the (app) group's load
 * guard, not here.
 */

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;

	const token = event.cookies.get(SESSION_COOKIE);
	if (token) {
		const session = await validateSessionToken(getSessionDeps(), token);
		if (session) {
			const user = await getAccounts().findById(session.userId);
			if (user) {
				event.locals.user = user;
			} else {
				clearSessionCookie(event.cookies);
			}
		} else {
			clearSessionCookie(event.cookies);
		}
	}

	const response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'same-origin');
	return response;
};
