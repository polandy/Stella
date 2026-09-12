import { error, redirect, type RequestHandler } from '@sveltejs/kit';
import { isLocale } from '$lib/i18n/locales';
import { createTranslator } from '$lib/i18n/translate';
import { changeLocale } from '$lib/server/auth/accounts';
import { setLocaleCookie } from '$lib/server/auth/cookies';
import { safeDestination } from '$lib/server/http/safe-redirect';
import { getAccountDeps } from '$lib/server/services';

/*
 * The one place the interface language is chosen (docs/02 §2.19). It answers the picker in
 * Settings and the one on the login screen alike, which is why it lives outside both route
 * groups: a visitor with no account has to be able to read the sign-in page too.
 *
 * A plain form post, so the language can be changed without JavaScript; the caller says
 * where to come back to and is sent there, which also re-renders the page in the new
 * language without a client-side story of its own.
 */

export const POST: RequestHandler = async ({ request, cookies, locals }) => {
	const form = await request.formData();
	const requested = form.get('locale');

	if (!isLocale(requested)) {
		throw error(400, createTranslator(locals.locale)('settings.language.unsupported'));
	}

	// The profile is the lasting choice; the cookie carries it to the pages seen while
	// signed out, and to the first paint of the very next request.
	if (locals.user) await changeLocale(getAccountDeps(), locals.user.id, requested);
	setLocaleCookie(cookies, requested);

	throw redirect(303, safeDestination(form.get('redirectTo')));
};
