import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { createTranslator, type MessageKey } from '$lib/i18n/translate';
import { registerFirstAdmin } from '$lib/server/auth/accounts';
import { setSessionCookie } from '$lib/server/auth/cookies';
import { createSession } from '$lib/server/auth/session';
import { getAccountDeps, getAccounts, getSessionDeps } from '$lib/server/services';
import type { Actions, PageServerLoad } from './$types';

/*
 * First-run setup: create the household and its break-glass admin. Only reachable while
 * no account exists yet (docs/02 §2.1).
 */

/*
 * Validation messages are message keys (docs/02 §2.19): the page turns them into the
 * visitor's language, so the schema stays a single, language-free description of the form.
 */
const SetupSchema = v.object({
	householdName: v.pipe(v.string(), v.trim(), v.minLength(1, key('auth.setup.needHousehold'))),
	name: v.pipe(v.string(), v.trim(), v.minLength(1, key('auth.setup.needName'))),
	email: v.pipe(v.string(), v.trim(), v.email(key('auth.setup.needEmail'))),
	password: v.pipe(v.string(), v.minLength(8, key('auth.setup.needPassword')))
});

/** Identity on a message key, so a typo in a validation message is a compile error. */
function key(name: MessageKey): MessageKey {
	return name;
}

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) throw redirect(302, '/');
	if ((await getAccounts().countUsers()) > 0) throw redirect(302, '/login');
};

export const actions: Actions = {
	default: async ({ request, cookies, locals }) => {
		// Everything this action says back is rendered here, in the language of the request.
		const t = createTranslator(locals.locale);
		const form = await request.formData();
		const parsed = v.safeParse(SetupSchema, {
			householdName: form.get('householdName'),
			name: form.get('name'),
			email: form.get('email'),
			password: form.get('password')
		});
		if (!parsed.success) {
			// Every message in the schema above is a key; anything else would be a valibot default.
			const issue = parsed.issues[0]?.message as MessageKey | undefined;
			return fail(400, { error: t(issue ?? 'auth.setup.invalidInput') });
		}

		if ((await getAccounts().countUsers()) > 0) {
			return fail(409, { error: t('auth.setup.alreadyDone') });
		}

		// The language the form was read in becomes the admin's stored preference.
		const user = await registerFirstAdmin(getAccountDeps(), {
			...parsed.output,
			locale: locals.locale
		});
		const { token, session } = await createSession(getSessionDeps(), user.id);
		setSessionCookie(cookies, token, session.expiresAt);
		throw redirect(303, '/');
	}
};
