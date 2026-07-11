import type { Cookies } from '@sveltejs/kit';

/*
 * Session cookie helpers. The cookie holds the raw session token; it is httpOnly,
 * SameSite=Lax, and Secure in production (docs/04 §4.7).
 */

export const SESSION_COOKIE = 'stella_session';

export function setSessionCookie(cookies: Cookies, token: string, expiresAt: number): void {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
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
		secure: process.env.NODE_ENV === 'production',
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
