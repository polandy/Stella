import { redirect } from '@sveltejs/kit';
import { clearSessionCookie, SESSION_COOKIE } from '$lib/server/auth/cookies';
import { invalidateSession } from '$lib/server/auth/session';
import { getSessionDeps } from '$lib/server/services';
import type { RequestHandler } from './$types';

/* Sign out: revoke the server-side session and clear the cookie (docs/02 §2.1). */

export const POST: RequestHandler = async ({ cookies }) => {
	const token = cookies.get(SESSION_COOKIE);
	if (token) {
		await invalidateSession(getSessionDeps(), token);
	}
	clearSessionCookie(cookies);
	throw redirect(303, '/login');
};
