import { fail } from '@sveltejs/kit';
import { requireUser, requireViewer } from '$lib/server/auth/guards';
import { say, translator } from '$lib/server/i18n/say';
import { setSelfContact, UnknownSelfContactError } from '$lib/server/domain/household/self-contact';
import { countKnownByAFirstNameOnly } from '$lib/server/domain/contacts/contacts';
import { countLastNames } from '$lib/server/domain/contacts/last-names';
import { getUpdateCheck } from '$lib/server/services';
import { APP_VERSION } from '$lib/version';
import type { Actions, PageServerLoad } from './$types';

/**
 * Settings landing (docs/02 §2.17): the language, who you are, the data-quality checks, the
 * admin "Data" section, Immich when it is configured, and the "About" line.
 *
 * The release check is handed over as a promise on purpose (docs/02 §2.17.1): the page is
 * rendered and sent at once, and the line about a newer version fills itself in when GitHub
 * answers — so an instance that cannot reach it still opens Settings immediately.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);
	const check = getUpdateCheck();
	const viewer = requireViewer(locals);
	// How many are left to tidy up, so the card says whether opening it is worth it.
	const [firstNameOnlyCount, lastNames] = await Promise.all([
		countKnownByAFirstNameOnly(locals.services.people.contactDeps, viewer),
		countLastNames(locals.services.people.surnameReviewDeps, viewer)
	]);
	return {
		isAdmin: user.role === 'admin',
		firstNameOnlyCount,
		lastNames,
		version: APP_VERSION,
		update: check?.status() ?? null,
		// Immich's line (docs/02 §2.24.1), streamed like the release check; null
		// when this instance has no Immich, and then the section is not there at all.
		immich: locals.services.immich?.connection.status() ?? null
	};
};

export const actions: Actions = {
	/* "Which of these people am I?" (docs/02 §2.1.3). An empty pick clears the link. */
	setSelf: async ({ request, locals }) => {
		const user = requireUser(locals);
		const viewer = requireViewer(locals);

		const contactId = (await request.formData()).get('contactId');
		try {
			const saved = await setSelfContact(
				locals.services.people.selfContactDeps,
				viewer,
				typeof contactId === 'string' ? contactId : null
			);
			// The load functions re-run inside this same request, off the `locals` the hook
			// filled before the write — without this they would answer with the old pick.
			locals.user = { ...user, selfContactId: saved };
		} catch (err) {
			if (err instanceof UnknownSelfContactError)
				return fail(400, { selfError: err.phrase(translator(locals)) });
			throw err;
		}

		return { selfSaved: say(locals, 'settings.self.saved') };
	}
};
