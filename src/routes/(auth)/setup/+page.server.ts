import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { registerFirstAdmin } from '$lib/server/auth/accounts';
import { setSessionCookie } from '$lib/server/auth/cookies';
import { createSession } from '$lib/server/auth/session';
import { getAccountDeps, getAccounts, getSessionDeps } from '$lib/server/services';
import type { Actions, PageServerLoad } from './$types';

/*
 * First-run setup: create the household and its break-glass admin. Only reachable while
 * no account exists yet (docs/02 §2.1).
 */

const SetupSchema = v.object({
	householdName: v.pipe(v.string(), v.trim(), v.minLength(1, 'Please name your household.')),
	name: v.pipe(v.string(), v.trim(), v.minLength(1, 'Please enter your name.')),
	email: v.pipe(v.string(), v.trim(), v.email('Please enter a valid email.')),
	password: v.pipe(v.string(), v.minLength(8, 'Use at least 8 characters.'))
});

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) throw redirect(302, '/');
	if ((await getAccounts().countUsers()) > 0) throw redirect(302, '/login');
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const parsed = v.safeParse(SetupSchema, {
			householdName: form.get('householdName'),
			name: form.get('name'),
			email: form.get('email'),
			password: form.get('password')
		});
		if (!parsed.success) {
			return fail(400, { error: parsed.issues[0]?.message ?? 'Invalid input.' });
		}

		if ((await getAccounts().countUsers()) > 0) {
			return fail(409, { error: 'Setup has already been completed.' });
		}

		const user = await registerFirstAdmin(getAccountDeps(), parsed.output);
		const { token, session } = await createSession(getSessionDeps(), user.id);
		setSessionCookie(cookies, token, session.expiresAt);
		throw redirect(303, '/');
	}
};
