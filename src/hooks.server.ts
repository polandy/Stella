import type { Handle } from '@sveltejs/kit';
import { LOCALE_COOKIE } from '$lib/i18n/locales';
import { resolveLocale } from '$lib/i18n/resolve';
import { API_PATH_PREFIX, authenticateApiToken, bearerTokenOf } from '$lib/server/auth/api-tokens';
import { clearSessionCookie, SESSION_COOKIE, setLocaleCookie } from '$lib/server/auth/cookies';
import { validateSessionToken } from '$lib/server/auth/session';
import { getAccounts, getApiTokenDeps, getSessionDeps } from '$lib/server/services';

/*
 * Request entry point (docs/04 §4.4). Resolves the session cookie to `locals.user`, settles
 * the language the answer is written in, and sets baseline security headers. Route
 * protection lives in the (app) group's load guard, not here.
 *
 * The API (`/api/v1/`) is the one exception: there the member is who the bearer token says,
 * and the cookie is not read at all. A browser that happens to be signed in therefore cannot
 * be steered into calling the API by another site, and a token can never open the app's pages.
 */

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;

	const token = event.cookies.get(SESSION_COOKIE);
	const viaApi = event.url.pathname.startsWith(API_PATH_PREFIX);
	if (viaApi) {
		const bearer = bearerTokenOf(event.request.headers.get('authorization'));
		const userId = bearer ? await authenticateApiToken(getApiTokenDeps(), bearer) : null;
		event.locals.user = userId ? await getAccounts().findById(userId) : null;
	} else if (token) {
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
	// A script has no browser to remember a language for.
	if (chosen && chosen !== cookieLocale && !viaApi) setLocaleCookie(event.cookies, chosen);

	const response = await resolve(event, {
		// Screen readers and the browser's own translation prompt both go by `<html lang>`.
		transformPageChunk: ({ html }) => html.replace('%lang%', event.locals.locale)
	});
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'same-origin');
	return response;
};
