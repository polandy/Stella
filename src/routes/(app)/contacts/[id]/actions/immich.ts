import { error, fail, redirect } from '@sveltejs/kit';
import { contactSectionPath } from '$lib/contacts/sections';
import { ContactGoneError } from '$lib/server/domain/contacts/require-visible';
import { ImmichLinkRefusedError, linkToImmich, unlinkFromImmich } from '$lib/server/domain/immich/links';
import { getImmichLinkDeps } from '$lib/server/services';
import { say, translator } from '$lib/server/i18n/say';
import type { Actions } from '../$types';

/*
 * The Photos card's Immich menu (docs/concepts/immich.md §4.3). Any member who can see the person
 * may link or unlink them (§9.4); without Immich configured, neither exists.
 */
export const immichActions = {
	linkImmich: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const deps = getImmichLinkDeps();
		if (!deps) throw error(404, say(locals, 'errors.notFound'));

		const personId = (await request.formData()).get('immichPersonId');
		try {
			await linkToImmich(
				deps,
				{ userId: locals.user.id, householdId: locals.user.householdId },
				params.id,
				typeof personId === 'string' ? personId : ''
			);
		} catch (err) {
			if (err instanceof ContactGoneError) throw error(404, say(locals, 'errors.contact.notFound'));
			if (err instanceof ImmichLinkRefusedError) return fail(400, { immichError: err.phrase(translator(locals)) });
			throw err;
		}
		throw redirect(303, contactSectionPath(params.id, 'photos'));
	},

	unlinkImmich: async ({ params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const deps = getImmichLinkDeps();
		if (!deps) throw error(404, say(locals, 'errors.notFound'));
		try {
			await unlinkFromImmich(deps, { userId: locals.user.id, householdId: locals.user.householdId }, params.id);
		} catch (err) {
			if (err instanceof ContactGoneError) throw error(404, say(locals, 'errors.contact.notFound'));
			throw err;
		}
		throw redirect(303, contactSectionPath(params.id, 'photos'));
	}
} satisfies Actions;
