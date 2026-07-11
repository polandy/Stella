import type { Cookies } from '@sveltejs/kit';
import { getConfig } from '$lib/server/config';

/*
 * Session cookie helpers. The cookie holds the raw session token; it is httpOnly,
 * SameSite=Lax, and Secure only when served over HTTPS (docs/04 §4.7).
 */

export const SESSION_COOKIE = 'stella_session';

/*
 * The Secure attribute is derived from the configured URL scheme, not NODE_ENV: browsers
 * silently drop a Secure cookie sent over plain HTTP to any non-localhost host (e.g. a LAN
 * IP), which would make login appear to fail with no error. Serving over HTTPS re-enables it.
 */
function cookieSecure(): boolean {
	return getConfig().url.startsWith('https://');
}

export function setSessionCookie(cookies: Cookies, token: string, expiresAt: number): void {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: cookieSecure(),
		expires: new Date(expiresAt)
	});
}

export function clearSessionCookie(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

/*
 * Short-lived cookie holding the OIDC transaction (state / nonce / PKCE verifier) between
 * the redirect to the provider and the callback. httpOnly so it is never readable by JS.
 */

const OIDC_COOKIE = 'stella_oidc';

export interface OidcTransaction {
	state: string;
	nonce: string;
	codeVerifier: string;
}

export function setOidcTransaction(cookies: Cookies, tx: OidcTransaction): void {
	cookies.set(OIDC_COOKIE, JSON.stringify(tx), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: cookieSecure(),
		maxAge: 600
	});
}

export function readOidcTransaction(cookies: Cookies): OidcTransaction | null {
	const raw = cookies.get(OIDC_COOKIE);
	if (!raw) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		if (
			typeof parsed === 'object' &&
			parsed !== null &&
			typeof (parsed as OidcTransaction).state === 'string' &&
			typeof (parsed as OidcTransaction).nonce === 'string' &&
			typeof (parsed as OidcTransaction).codeVerifier === 'string'
		) {
			return parsed as OidcTransaction;
		}
	} catch {
		// fall through to null
	}
	return null;
}

export function clearOidcTransaction(cookies: Cookies): void {
	cookies.delete(OIDC_COOKIE, { path: '/' });
}
