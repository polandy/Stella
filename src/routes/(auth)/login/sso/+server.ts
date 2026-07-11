import { redirect } from '@sveltejs/kit';
import { setOidcTransaction } from '$lib/server/auth/cookies';
import { createAuthorizationRequest } from '$lib/server/auth/oidc/login';
import { getConfig } from '$lib/server/config';
import { getAuthorizationRequestDeps } from '$lib/server/services';
import type { RequestHandler } from './$types';

/*
 * Start of the SSO flow: build the provider authorization redirect (auth-code + PKCE) and
 * stash the one-time state/nonce/verifier in a short-lived cookie for the callback.
 */

export const GET: RequestHandler = async ({ cookies }) => {
	if (!getConfig().auth.oidc) {
		throw redirect(302, '/login');
	}

	const request = await createAuthorizationRequest(getAuthorizationRequestDeps());
	setOidcTransaction(cookies, {
		state: request.state,
		nonce: request.nonce,
		codeVerifier: request.codeVerifier
	});
	throw redirect(302, request.url);
};
