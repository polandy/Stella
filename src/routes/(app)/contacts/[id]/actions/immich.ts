import { error, fail, redirect } from '@sveltejs/kit';
import { requireViewer } from '$lib/server/auth/guards';
import { contactSectionPath } from '$lib/contacts/sections';
import { ContactGoneError } from '$lib/server/domain/contacts/require-visible';
import { ignoreMatch } from '$lib/server/domain/immich/ignores';
import {
	ImmichLinkRefusedError,
	linkToImmich,
	unlinkFromImmich
} from '$lib/server/domain/immich/links';
import { useImmichPhoto } from '$lib/server/domain/immich/use-as-photo';
import { InvalidAvatarError } from '$lib/server/domain/media/avatars';
import { say, translator } from '$lib/server/i18n/say';
import type { Actions } from '../$types';

/*
 * The Photos card's Immich menu (docs/02 §2.24.2). Any member who can see the person
 * may link or unlink them; without Immich configured, neither exists. *Use as photo* in the
 * Immich viewer keeps a square of one of their photos as their own (docs/02 §2.24.6).
 * *Ignore* on the card's suggestion is the matching list's lasting no (docs/02 §2.24.7), through
 * the same use-case; its *Link* is `linkImmich`.
 */
export const immichActions = {
	linkImmich: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);
		const deps = locals.services.immich?.immichLinkDeps;
		if (!deps) throw error(404, say(locals, 'errors.notFound'));

		const personId = (await request.formData()).get('immichPersonId');
		try {
			await linkToImmich(
				deps,
				{ userId: viewer.id, householdId: viewer.householdId },
				params.id,
				typeof personId === 'string' ? personId : ''
			);
		} catch (err) {
			if (err instanceof ContactGoneError) throw error(404, say(locals, 'errors.contact.notFound'));
			if (err instanceof ImmichLinkRefusedError)
				return fail(400, { immichError: err.phrase(translator(locals)) });
			throw err;
		}
		throw redirect(303, contactSectionPath(params.id, 'photos'));
	},

	/* Held for the undo window by the card first, like any removal (docs/02 §2.23). */
	ignoreImmichMatch: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);
		const deps = locals.services.immich?.immichIgnoreDeps;
		if (!deps) throw error(404, say(locals, 'errors.notFound'));

		const personId = (await request.formData()).get('immichPersonId');
		try {
			await ignoreMatch(
				deps,
				{ userId: viewer.id, householdId: viewer.householdId },
				params.id,
				typeof personId === 'string' ? [personId] : []
			);
		} catch (err) {
			if (err instanceof ContactGoneError) throw error(404, say(locals, 'errors.contact.notFound'));
			if (err instanceof ImmichLinkRefusedError)
				return fail(400, { immichError: err.phrase(translator(locals)) });
			throw err;
		}
		return { ignoredImmichMatch: true };
	},

	unlinkImmich: async ({ params, locals }) => {
		const viewer = requireViewer(locals);
		const deps = locals.services.immich?.immichLinkDeps;
		if (!deps) throw error(404, say(locals, 'errors.notFound'));
		try {
			await unlinkFromImmich(
				deps,
				{ userId: viewer.id, householdId: viewer.householdId },
				params.id
			);
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
		// Before Immich configuration or the upload itself is read, so an anonymous caller is
		// redirected rather than answered as if the route were simply unconfigured, and never
		// has their upload decoded at all.
		const viewer = requireViewer(locals);
		const deps = locals.services.immich?.useImmichPhotoDeps;
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
		try {
			const kept = await useImmichPhoto(deps, viewer, { contactId: params.id, token, upload });
			// Every refusal reads the same: what changed — an unlink, a private person, a day gone
			// by — is not the proxy's to tell, and a reload shows the page as it is now.
			if (!kept.ok) return fail(404, { photoError: say(locals, 'errors.photo.fromImmichGone') });
		} catch (err) {
			if (err instanceof InvalidAvatarError)
				return fail(400, { photoError: err.phrase(translator(locals)) });
			throw err;
		}
		throw redirect(303, contactSectionPath(params.id, 'photos'));
	}
} satisfies Actions;
