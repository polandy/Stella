import { error, fail, redirect } from '@sveltejs/kit';
import { contactSectionPath } from '$lib/contacts/sections';
import { ContactGoneError } from '$lib/server/domain/contacts/require-visible';
import { ImmichLinkRefusedError, linkToImmich, unlinkFromImmich } from '$lib/server/domain/immich/links';
import { useImmichPhoto } from '$lib/server/domain/immich/use-as-photo';
import { InvalidAvatarError } from '$lib/server/domain/media/avatars';
import { getImmichLinkDeps, getUseImmichPhotoDeps } from '$lib/server/services';
import { say, translator } from '$lib/server/i18n/say';
import type { Actions } from '../$types';

/*
 * The Photos card's Immich menu (docs/concepts/immich.md §4.3). Any member who can see the person
 * may link or unlink them (§9.4); without Immich configured, neither exists. *Use as photo* in the
 * Immich viewer keeps a square of one of their photos as their own (docs/02 §2.24.6).
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
	},

	/**
	 * Keep the square cut in the browser from a photo in the Immich viewer as the person's new
	 * photo. The browser names the preview by its signed token, never by an Immich id; the
	 * use-case checks the token, the viewer and the link before anything is stored.
	 */
	useImmichPhoto: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const deps = getUseImmichPhotoDeps();
		if (!deps) throw error(404, say(locals, 'errors.notFound'));

		const form = await request.formData();
		const token = form.get('token');
		const image = form.get('image');
		const thumb = form.get('thumb');
		if (typeof token !== 'string' || !(image instanceof File) || !(thumb instanceof File)) {
			return fail(400, { photoError: say(locals, 'errors.photo.unreadable') });
		}
		const upload = {
			image: new Uint8Array(await image.arrayBuffer()),
			thumb: new Uint8Array(await thumb.arrayBuffer()),
			width: Number(form.get('width')),
			height: Number(form.get('height'))
		};
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };
		try {
			const kept = await useImmichPhoto(deps, viewer, { contactId: params.id, token, upload });
			// Every refusal reads the same: what changed — an unlink, a private person, a day gone
			// by — is not the proxy's to tell, and a reload shows the page as it is now.
			if (!kept.ok) return fail(404, { photoError: say(locals, 'errors.photo.fromImmichGone') });
		} catch (err) {
			if (err instanceof InvalidAvatarError) return fail(400, { photoError: err.phrase(translator(locals)) });
			throw err;
		}
		throw redirect(303, contactSectionPath(params.id, 'photos'));
	}
} satisfies Actions;
