import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit';
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALES } from '$lib/i18n/locales';
import { resolveLocale } from '$lib/i18n/resolve';
import { loadCatalog } from '$lib/i18n/translate';
import { clearSessionCookie, SESSION_COOKIE, setLocaleCookie } from '$lib/server/auth/cookies';
import { resolveRequestIdentity } from '$lib/server/auth/request-identity';
import { etagOf, isUnchanged, wantsEtag } from '$lib/server/http/etag';
import {
	describeUnexpectedError,
	isUnexpected,
	requestIdFrom
} from '$lib/server/http/unexpected-error';
import { createTranslator } from '$lib/i18n/translate';
import { getConfig } from '$lib/server/config';
import { getAccounts, getApiTokenDeps, getSessionDeps } from '$lib/server/services';

/*
 * Request entry point (docs/04 §4.4). Resolves the session cookie to `locals.user`, settles
 * the language the answer is written in, and sets baseline security headers. Route
 * protection lives in the (app) group's load guard, not here.
 *
 * The API (`/api/v1/`) is the one exception: there the member is who the bearer token says,
 * and the cookie is not read at all (`resolveRequestIdentity`).
 */

/*
 * Every message catalogue, loaded once before the first request. Only the browser fetches a
 * language on demand (docs/04 §4.4); the server speaks them all, and its routes, actions and
 * `say()` translate synchronously from here on.
 */
export const init: ServerInit = async () => {
	// Read the configuration now, so a half-made one (Immich's URL without its key, say) stops
	// the server at start rather than on the first page somebody opens.
	getConfig();
	await Promise.all(LOCALES.map((locale) => loadCatalog(locale)));
};

export const handle: Handle = async ({ event, resolve }) => {
	// First, so even a failure while finding out who is asking is logged under an id.
	event.locals.requestId = requestIdFrom(event.request.headers.get('x-request-id'), () =>
		crypto.randomUUID()
	);
	const identity = await resolveRequestIdentity(
		{
			apiTokens: getApiTokenDeps(),
			sessions: getSessionDeps(),
			findUser: (id) => getAccounts().findById(id)
		},
		{
			pathname: event.url.pathname,
			authorization: event.request.headers.get('authorization'),
			sessionToken: event.cookies.get(SESSION_COOKIE)
		}
	);
	event.locals.user = identity.user;
	if (identity.staleSessionCookie) clearSessionCookie(event.cookies);
	const viaApi = identity.viaApi;

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
	const answer = await withEtag(event.request, response);
	answer.headers.set('X-Content-Type-Options', 'nosniff');
	answer.headers.set('X-Frame-Options', 'DENY');
	answer.headers.set('Referrer-Policy', 'same-origin');
	answer.headers.set('X-Request-Id', event.locals.requestId);
	return answer;
};

/**
 * Every error nobody planned for ends here: a bug, a constraint violation, a full disk — and a
 * command that broke, named by its type (`CommandFailedError`). Refusals the member can act on
 * never get this far; their edge answers them (docs/04 §4.4). It is logged once, under the
 * request's id, and the member is told only that it was ours, with the id to quote.
 */
export const handleError: HandleServerError = ({ error, event, status, message }) => {
	if (!isUnexpected(status)) return { message };
	const requestId = event.locals.requestId ?? crypto.randomUUID();
	console.error(
		describeUnexpectedError({
			requestId,
			status,
			method: event.request.method,
			path: event.url.pathname,
			error
		}),
		error
	);
	// The language may not be settled yet when the failure came early in `handle`.
	const t = createTranslator(event.locals.locale ?? DEFAULT_LOCALE);
	return { message: t('errors.unexpected', { requestId }), requestId };
};

/**
 * A page's data, tagged with its content — or, when the device already holds exactly that, a
 * bodiless 304 (docs/04 ADR-074). The page is still worked out in full;
 * what is saved is the phone's data, not the server's time.
 */
async function withEtag(request: Request, response: Response): Promise<Response> {
	const answer = {
		method: request.method,
		// The request's own address: SvelteKit's `event.url` has `/__data.json` taken off.
		pathname: new URL(request.url).pathname,
		status: response.status,
		contentType: response.headers.get('content-type')
	};
	if (!wantsEtag(answer)) return response;

	const body = new Uint8Array(await response.arrayBuffer());
	const etag = etagOf(body);
	const headers = new Headers(response.headers);
	headers.set('ETag', etag);
	if (isUnchanged(request.headers.get('if-none-match'), etag)) {
		headers.delete('content-length');
		return new Response(null, { status: 304, headers });
	}
	return new Response(body, { status: response.status, statusText: response.statusText, headers });
}
