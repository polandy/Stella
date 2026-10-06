import { dispatchCommand } from '$lib/server/domain/commands/dispatch';
import { parseCommand, parsePhotoCommand } from '$lib/server/commands/parse';
import { ulidGenerator } from '$lib/server/id';
import { systemClock } from '$lib/server/clock';
import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { getContact } from '$lib/server/domain/contacts/contacts';
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
import { contactSectionPath } from '$lib/contacts/sections';
import {
	getCommandDeps,
	getContactDeps,
	getCutDeps,
	getFramingDeps,
	getGalleryDeps
} from '$lib/server/services';
import { say, translator } from '$lib/server/i18n/say';
import type { Actions } from '../$types';

/** Visibility of a newly uploaded gallery photo (docs/02 §2.14). */
const VisibilitySchema = v.optional(v.picklist(['shared', 'private']), 'shared');

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
	/** Add one or more photos to the gallery (docs/02 §2.14). */
	addGalleryPhotos: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };
		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

		const form = await request.formData();
		const images = form.getAll('image').filter((f): f is File => f instanceof File);
		const thumbs = form.getAll('thumb').filter((f): f is File => f instanceof File);
		const widths = form.getAll('width');
		const heights = form.getAll('height');
		if (images.length === 0 || images.length !== thumbs.length) {
			return fail(400, { photoError: say(locals, 'errors.image.chooseSome') });
		}
		const visibility = v.parse(VisibilitySchema, form.get('visibility') || undefined);

		// An upload is a command, and each photo one of its own following it (docs/04 §4.11.2).
		const author = { userId: viewer.id, householdId: viewer.householdId, locale: locals.locale };
		const refusal = (outcome: Awaited<ReturnType<typeof dispatchCommand>> | null) =>
			fail(400, {
				photoError:
					outcome?.status === 'refused'
						? outcome.reason(translator(locals))
						: say(locals, 'errors.image.couldNotStore')
			});
		const upload = parseCommand({
			id: form.get('commandId') || ulidGenerator.next(),
			type: 'gallery.add',
			payload: { contactId: params.id, visibility },
			issuedAt: systemClock.now()
		});
		const added = upload
			? await dispatchCommand(getCommandDeps(), author, upload).catch(() => null)
			: null;
		if (!upload || added?.status !== 'applied') return refusal(added);
		for (const [index, image] of images.entries()) {
			const photo = parsePhotoCommand({
				id: ulidGenerator.next(),
				type: 'gallery.photo',
				parentId: upload.id,
				image: new Uint8Array(await image.arrayBuffer()),
				thumb: new Uint8Array(await thumbs[index]!.arrayBuffer()),
				width: Number(widths[index]),
				height: Number(heights[index]),
				issuedAt: systemClock.now()
			});
			const stored = photo
				? await dispatchCommand(getCommandDeps(), author, photo).catch(() => null)
				: null;
			if (stored?.status !== 'applied') return refusal(stored);
		}
		throw redirect(303, contactSectionPath(params.id, 'photos'));
	},

	/** Caption a gallery photo; blank clears it. Only its uploader may. */
	captionPhoto: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };
		const form = await request.formData();
		const photoId = form.get('photoId');
		const caption = form.get('caption');
		if (typeof photoId !== 'string' || typeof caption !== 'string') {
			return fail(400, { photoError: say(locals, 'errors.caption.unreadable') });
		}
		try {
			if (!(await captionGalleryPhoto(getGalleryDeps(), viewer, photoId, caption))) {
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
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };
		const form = await request.formData();
		const parsed = v.safeParse(PhotoVisibilitySchema, {
			photoId: form.get('photoId'),
			visibility: form.get('visibility')
		});
		if (!parsed.success) return fail(400, { photoError: say(locals, 'errors.photo.unreadable') });
		if (
			!(await setGalleryPhotoVisibility(
				getGalleryDeps(),
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
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };
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
		if (!(await pinGalleryPhoto(getGalleryDeps(), viewer, input))) {
			return fail(404, { photoError: say(locals, 'errors.photo.notFound') });
		}
		throw redirect(303, contactSectionPath(params.id, 'photos'));
	},

	/**
	 * Wear a gallery photo as this contact's avatar through the square chosen in the cropper
	 * (docs/02 §2.14). The browser sends the square and its rendering, as for a new avatar.
	 */
	framePhotoAsAvatar: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };
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
				!(await frameAsAvatar(getFramingDeps(), viewer, {
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
	 * (docs/concepts/circle-photos.md §5.1). The browser sends the square and its rendering.
	 */
	cutFromGroupPhoto: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };
		const form = await request.formData();
		form.set('contactId', params.id);
		const input = await readCutForm(form);
		if (!input) return fail(400, { photoError: say(locals, 'errors.photo.unreadable') });
		try {
			if (!(await cutProfilePicture(getCutDeps(), viewer, input))) {
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
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };
		const form = await request.formData();
		const photoId = form.get('photoId');
		if (typeof photoId !== 'string')
			return fail(400, { photoError: say(locals, 'errors.photo.unreadable') });
		if (!(await removeGalleryPhoto(getGalleryDeps(), viewer, photoId))) {
			return fail(403, { photoError: say(locals, 'errors.photo.onlyOwnerRemove') });
		}
		throw redirect(303, contactSectionPath(params.id, 'photos'));
	}
} satisfies Actions;
