import { redirect } from '@sveltejs/kit';
import { clearSessionCookie, SESSION_COOKIE } from '$lib/server/auth/cookies';
import { planRpLogout, SIGNED_OUT_PATH } from '$lib/server/auth/oidc/logout';
import { signOut } from '$lib/server/auth/session';
import { getRpLogoutDeps, getSessionDeps } from '$lib/server/services';
import type { RequestHandler } from './$types';

/*
 * Sign out (docs/02 §2.1). The Stella session is revoked and its cookie cleared first and
 * unconditionally; only then do we consider bouncing the browser through the provider's
 * end_session_endpoint so the SSO session ends too. If that is unavailable, the user is
 * still signed out here.
 */

export const POST: RequestHandler = async ({ cookies }) => {
	const token = cookies.get(SESSION_COOKIE);
	const { oidcIdToken } = token
		? await signOut(getSessionDeps(), token)
		: { oidcIdToken: null };
	clearSessionCookie(cookies);

	const providerLogout = await planRpLogout(getRpLogoutDeps(), oidcIdToken);
	throw redirect(303, providerLogout ?? SIGNED_OUT_PATH);
};
