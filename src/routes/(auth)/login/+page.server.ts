import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { authenticateLocal } from '$lib/server/auth/accounts';
import { setSessionCookie } from '$lib/server/auth/cookies';
import { createSession } from '$lib/server/auth/session';
import { getConfig } from '$lib/server/config';
import { getAccountDeps, getAccounts, getSessionDeps } from '$lib/server/services';
import type { Actions, PageServerLoad } from './$types';

/*
 * Local email/password login (docs/02 §2.1.1). SSO is offered separately when enabled.
 */

const LoginSchema = v.object({
	email: v.pipe(v.string(), v.trim(), v.email()),
	password: v.pipe(v.string(), v.minLength(1))
});

const SSO_ERRORS: Record<string, string> = {
	sso: 'Single sign-on failed. Please try again.',
	'not-authorized': 'Your account is not permitted to sign in here.',
	'no-account': 'No account exists for you yet. Ask an admin to invite you.'
};

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) throw redirect(302, '/');
	if ((await getAccounts().countUsers()) === 0) throw redirect(302, '/setup');
	const config = getConfig();
	const errorKey = url.searchParams.get('error');
	return {
		localEnabled: config.auth.local,
		oidcEnabled: config.auth.oidc,
		ssoError: errorKey ? (SSO_ERRORS[errorKey] ?? SSO_ERRORS.sso) : null
	};
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const parsed = v.safeParse(LoginSchema, {
			email: form.get('email'),
			password: form.get('password')
		});
		if (!parsed.success) {
			return fail(400, { error: 'Please enter a valid email and password.' });
		}

		const user = await authenticateLocal(getAccountDeps(), parsed.output);
		if (!user) {
			return fail(400, { error: 'Invalid email or password.' });
		}

		const { token, session } = await createSession(getSessionDeps(), user.id);
		setSessionCookie(cookies, token, session.expiresAt);
		throw redirect(303, '/');
	}
};
