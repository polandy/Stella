import { fail, redirect } from '@sveltejs/kit';
import { requireViewer } from '$lib/server/auth/guards';
import * as v from 'valibot';
import { InvalidAvatarError } from '$lib/server/domain/media/avatars';
import {
	captionGalleryPhoto,
	CaptionTooLongError,
	pinGalleryPhoto,
	removeGalleryPhoto,
	setGalleryPhotoVisibility
} from '$lib/server/domain/media/gallery';
import { cutProfilePicture } from '$lib/server/domain/media/cuts';
import { frameAsAvatar } from '$lib/server/domain/media/framing';
import { readCutForm } from '$lib/server/http/cut-form';
import { contactSectionPath } from '$lib/people/sections';
import { say, translator } from '$lib/server/i18n/say';
import type { Actions } from '../$types';

const PhotoVisibilitySchema = v.object({
	photoId: v.pipe(v.string(), v.minLength(1)),
	visibility: v.picklist(['shared', 'private'])
});

/** Pin a photo as a favourite, or unpin it; the form says which, so a resend is the same. */
const PhotoPinSchema = v.object({
	photoId: v.pipe(v.string(), v.minLength(1)),
	pinned: v.picklist(['true', 'false'])
});

/** The gallery card and its lightbox (docs/02 §2.14). */
export const photoActions = {
	/** Caption a gallery photo; blank clears it. Only its uploader may. */
	captionPhoto: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);
		const form = await request.formData();
		const photoId = form.get('photoId');
		const caption = form.get('caption');
		if (typeof photoId !== 'string' || typeof caption !== 'string') {
			return fail(400, { photoError: say(locals, 'errors.caption.unreadable') });
		}
		try {
			if (
				!(await captionGalleryPhoto(locals.services.media.galleryDeps, viewer, photoId, caption))
			) {
				return fail(403, { photoError: say(locals, 'errors.photo.onlyOwnerCaption') });
			}
		} catch (err) {
			if (err instanceof CaptionTooLongError)
				return fail(400, { photoError: err.phrase(translator(locals)) });
			throw err;
		}
		throw redirect(303, contactSectionPath(params.id, 'photos'));
	},

	/** Move a gallery photo between shared and private. Only its uploader may. */
	setPhotoVisibility: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);
		const form = await request.formData();
		const parsed = v.safeParse(PhotoVisibilitySchema, {
			photoId: form.get('photoId'),
			visibility: form.get('visibility')
		});
		if (!parsed.success) return fail(400, { photoError: say(locals, 'errors.photo.unreadable') });
		if (
			!(await setGalleryPhotoVisibility(
				locals.services.media.galleryDeps,
				viewer,
				parsed.output.photoId,
				parsed.output.visibility
			))
		) {
			return fail(403, { photoError: say(locals, 'errors.photo.onlyOwnerChange') });
		}
		throw redirect(303, contactSectionPath(params.id, 'photos'));
	},

	/** Pin a gallery photo as one of the person's favourites, or unpin it. Anyone who sees it may. */
	pinPhoto: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);
		const form = await request.formData();
		const parsed = v.safeParse(PhotoPinSchema, {
			photoId: form.get('photoId'),
			pinned: form.get('pinned')
		});
		if (!parsed.success) return fail(400, { photoError: say(locals, 'errors.photo.unreadable') });
		const input = {
			contactId: params.id,
			photoId: parsed.output.photoId,
			pinned: parsed.output.pinned === 'true'
		};
		if (!(await pinGalleryPhoto(locals.services.media.galleryDeps, viewer, input))) {
			return fail(404, { photoError: say(locals, 'errors.photo.notFound') });
		}
		throw redirect(303, contactSectionPath(params.id, 'photos'));
	},

	/**
	 * Wear a gallery photo as this contact's avatar through the square chosen in the cropper
	 * (docs/02 §2.14). The browser sends the square and its rendering, as for a new avatar.
	 */
	framePhotoAsAvatar: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);
		const form = await request.formData();
		const photoId = form.get('photoId');
		const image = form.get('image');
		const thumb = form.get('thumb');
		if (typeof photoId !== 'string' || !(image instanceof File) || !(thumb instanceof File)) {
			return fail(400, { photoError: say(locals, 'errors.photo.unreadable') });
		}
		const crop = {
			x: Number(form.get('cropX')),
			y: Number(form.get('cropY')),
			size: Number(form.get('cropSize'))
		};
		const upload = {
			image: new Uint8Array(await image.arrayBuffer()),
			thumb: new Uint8Array(await thumb.arrayBuffer()),
			width: Number(form.get('width')),
			height: Number(form.get('height'))
		};
		try {
			if (
				!(await frameAsAvatar(locals.services.media.framingDeps, viewer, {
					contactId: params.id,
					photoId,
					crop,
					upload
				}))
			) {
				return fail(404, { photoError: say(locals, 'errors.photo.notFound') });
			}
		} catch (err) {
			if (err instanceof InvalidAvatarError)
				return fail(400, { photoError: err.phrase(translator(locals)) });
			throw err;
		}
		throw redirect(303, contactSectionPath(params.id, 'photos'));
	},

	/**
	 * Cut this person's profile picture out of a photo of one of their circles
	 * (docs/02 §2.14). The browser sends the square and its rendering.
	 */
	cutFromGroupPhoto: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);
		const form = await request.formData();
		form.set('contactId', params.id);
		const input = await readCutForm(form);
		if (!input) return fail(400, { photoError: say(locals, 'errors.photo.unreadable') });
		try {
			if (!(await cutProfilePicture(locals.services.circles.cutDeps, viewer, input))) {
				return fail(404, { photoError: say(locals, 'errors.photo.notFound') });
			}
		} catch (err) {
			if (err instanceof InvalidAvatarError)
				return fail(400, { photoError: err.phrase(translator(locals)) });
			throw err;
		}
		throw redirect(303, `/contacts/${params.id}`);
	},

	/** Delete a gallery photo and its files. Only its uploader may. */
	removePhoto: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);
		const form = await request.formData();
		const photoId = form.get('photoId');
		if (typeof photoId !== 'string')
			return fail(400, { photoError: say(locals, 'errors.photo.unreadable') });
		if (!(await removeGalleryPhoto(locals.services.media.galleryDeps, viewer, photoId))) {
			return fail(403, { photoError: say(locals, 'errors.photo.onlyOwnerRemove') });
		}
		throw redirect(303, contactSectionPath(params.id, 'photos'));
	}
} satisfies Actions;
