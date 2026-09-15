import { fail, redirect } from '@sveltejs/kit';
import { say, translator } from '$lib/server/i18n/say';
import {
	setSelfContact,
	UnknownSelfContactError
} from '$lib/server/domain/household/self-contact';
import { getSelfContactDeps, getUpdateCheck } from '$lib/server/services';
import { APP_VERSION } from '$lib/version';
import type { Actions, PageServerLoad } from './$types';

/**
 * Settings landing (docs/02 §2.17): the language, who you are, the admin "Data" section and
 * the "About" line.
 *
 * The release check is handed over as a promise on purpose (docs/02 §2.17.1): the page is
 * rendered and sent at once, and the line about a newer version fills itself in when GitHub
 * answers — so an instance that cannot reach it still opens Settings immediately.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');
	const check = getUpdateCheck();
	return {
		isAdmin: locals.user.role === 'admin',
		version: APP_VERSION,
		update: check?.status() ?? null
	};
};

export const actions: Actions = {
	/* "Which of these people am I?" (docs/02 §2.1.3). An empty pick clears the link. */
	setSelf: async ({ request, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const contactId = (await request.formData()).get('contactId');
		try {
			const saved = await setSelfContact(
				getSelfContactDeps(),
				viewer,
				typeof contactId === 'string' ? contactId : null
			);
			// The load functions re-run inside this same request, off the `locals` the hook
			// filled before the write — without this they would answer with the old pick.
			locals.user = { ...locals.user, selfContactId: saved };
		} catch (err) {
			if (err instanceof UnknownSelfContactError)
				return fail(400, { selfError: err.phrase(translator(locals)) });
			throw err;
		}

		return { selfSaved: say(locals, 'settings.self.saved') };
	}
};
