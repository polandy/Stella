import type { Handle } from '@sveltejs/kit';
import { LOCALE_COOKIE } from '$lib/i18n/locales';
import { resolveLocale } from '$lib/i18n/resolve';
import { clearSessionCookie, SESSION_COOKIE, setLocaleCookie } from '$lib/server/auth/cookies';
import { validateSessionToken } from '$lib/server/auth/session';
import { getAccounts, getSessionDeps } from '$lib/server/services';

/*
 * Request entry point (docs/04 §4.4). Resolves the session cookie to `locals.user`, settles
 * the language the answer is written in, and sets baseline security headers. Route
 * protection lives in the (app) group's load guard, not here.
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

	const cookieLocale = event.cookies.get(LOCALE_COOKIE);
	event.locals.locale = resolveLocale({
		user: event.locals.user?.locale,
		cookie: cookieLocale,
		acceptLanguage: event.request.headers.get('accept-language')
	});
	// The cookie carries a *choice*, so only a stored preference writes it: it is what the
	// sign-in screen reads, and a language changed on another device would otherwise greet
	// this browser in the old one. A visitor who has chosen nothing keeps following their
	// browser, which is free to change its mind.
	const chosen = event.locals.user?.locale;
	if (chosen && chosen !== cookieLocale) setLocaleCookie(event.cookies, chosen);

	const response = await resolve(event, {
		// Screen readers and the browser's own translation prompt both go by `<html lang>`.
		transformPageChunk: ({ html }) => html.replace('%lang%', event.locals.locale)
	});
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'same-origin');
	return response;
};
