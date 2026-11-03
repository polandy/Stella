import { error, redirect } from '@sveltejs/kit';
import {
	clearOidcTransaction,
	readOidcTransaction,
	setSessionCookie
} from '$lib/server/auth/cookies';
import { completeOidcLogin } from '$lib/server/auth/oidc/login';
import { createSession } from '$lib/server/auth/session';
import { say } from '$lib/server/i18n/say';
import type { RequestHandler } from './$types';

/*
 * SSO callback: validate `state`, exchange the code, resolve/provision the user, and
 * establish a Stella session. Any failure returns to the login page with an error flag
 * (never a blank page).
 */

export const GET: RequestHandler = async ({ url, cookies, locals }) => {
	if (!locals.services.auth.methods.oidc) throw error(404, say(locals, 'errors.notFound'));

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const transaction = readOidcTransaction(cookies);
	clearOidcTransaction(cookies);

	// A member already signed in keeps their session: a callback they did not start (a crafted
	// link) must not swap it for another account, and the sign-in page never starts one for them.
	if (locals.user) throw redirect(303, '/');

	if (!code || !state || !transaction || transaction.state !== state) {
		throw redirect(302, '/login?error=sso');
	}

	let result;
	try {
		result = await completeOidcLogin(locals.services.auth.completeLoginDeps, {
			code,
			codeVerifier: transaction.codeVerifier,
			expectedNonce: transaction.nonce
		});
	} catch (failure) {
		// The visitor sees one sentence; the operator setting up the provider needs the cause —
		// a wrong client secret, an unreachable token endpoint, a nonce mismatch.
		console.error(`[sso] ${locals.requestId} sign-in failed:`, failure);
		throw redirect(302, '/login?error=sso');
	}

	if (!result.ok) {
		throw redirect(302, `/login?error=${result.reason}`);
	}

	const { token, session } = await createSession(
		locals.services.auth.sessionDeps,
		result.userId,
		result.idToken
	);
	setSessionCookie(cookies, token, session.expiresAt);
	throw redirect(303, '/');
};
