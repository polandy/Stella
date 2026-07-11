import { redirect } from '@sveltejs/kit';
import {
	clearOidcTransaction,
	readOidcTransaction,
	setSessionCookie
} from '$lib/server/auth/cookies';
import { completeOidcLogin } from '$lib/server/auth/oidc/login';
import { createSession } from '$lib/server/auth/session';
import { getCompleteLoginDeps, getSessionDeps } from '$lib/server/services';
import type { RequestHandler } from './$types';

/*
 * SSO callback: validate `state`, exchange the code, resolve/provision the user, and
 * establish a Stella session. Any failure returns to the login page with an error flag
 * (never a blank page).
 */

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const transaction = readOidcTransaction(cookies);
	clearOidcTransaction(cookies);

	if (!code || !state || !transaction || transaction.state !== state) {
		throw redirect(302, '/login?error=sso');
	}

	let result;
	try {
		result = await completeOidcLogin(getCompleteLoginDeps(), {
			code,
			codeVerifier: transaction.codeVerifier,
			expectedNonce: transaction.nonce
		});
	} catch {
		throw redirect(302, '/login?error=sso');
	}

	if (!result.ok) {
		throw redirect(302, `/login?error=${result.reason}`);
	}

	const { token, session } = await createSession(getSessionDeps(), result.userId);
	setSessionCookie(cookies, token, session.expiresAt);
	throw redirect(303, '/');
};
