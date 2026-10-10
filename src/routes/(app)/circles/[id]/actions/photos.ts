import { error, fail, type RequestEvent } from '@sveltejs/kit';
import { requireRemover, requireViewer } from '$lib/server/auth/guards';
import * as v from 'valibot';
import {
	captionCirclePhoto,
	pinCirclePhoto,
	removeCirclePhoto,
	setCirclePhotoRole,
	setCirclePhotoVisibility,
	UnknownPhotoRoleError
} from '$lib/server/domain/circles/circle-photos';
import { getCircle } from '$lib/server/domain/circles/circles';
import { InvalidAvatarError } from '$lib/server/domain/media/avatars';
import { cutProfilePicture } from '$lib/server/domain/media/cuts';
import { CaptionTooLongError } from '$lib/server/domain/media/gallery';
import { say, translator } from '$lib/server/i18n/say';
import { readCutForm } from '$lib/server/http/cut-form';
import type { Actions } from '../$types';

/*
 * The lightbox of a circle's photos (docs/02 §2.4.2). Caption, role and pin are for anyone who
 * sees the photo; shared/private and removing for whoever added it (concept §4) — the
 * use-cases decide, these only read the form. A save answers with data rather than a redirect,
 * so the lightbox stays open on the photo and the page keeps its scroll.
 */

const PhotoId = v.pipe(v.string(), v.minLength(1));

/** The signed-in viewer and the circle, which must be one they can see. */
async function circleOf({
	locals,
	params
}: Pick<RequestEvent, 'locals'> & { params: { id: string } }) {
	const viewer = requireViewer(locals);
	if (!(await getCircle(locals.services.circles.circleDeps, viewer, params.id))) {
		throw error(404, say(locals, 'errors.circle.notFound'));
	}
	return { viewer, circleId: params.id };
}

const saved = { photoSaved: true } as const;

export const photoActions = {
	captionPhoto: async (event) => {
		const { viewer, circleId } = await circleOf(event);
		const form = await event.request.formData();
		const parsed = v.safeParse(v.object({ photoId: PhotoId, caption: v.string() }), {
			photoId: form.get('photoId'),
			caption: form.get('caption')
		});
		if (!parsed.success)
			return fail(400, { photoError: say(event.locals, 'errors.caption.unreadable') });
		try {
			if (
				!(await captionCirclePhoto(event.locals.services.circles.circlePhotoDeps, viewer, {
					circleId,
					...parsed.output
				}))
			) {
				return fail(404, { photoError: say(event.locals, 'errors.photo.notFound') });
			}
		} catch (err) {
			if (err instanceof CaptionTooLongError)
				return fail(400, { photoError: err.phrase(translator(event.locals)) });
			throw err;
		}
		return saved;
	},

	setPhotoRole: async (event) => {
		const { viewer, circleId } = await circleOf(event);
		const form = await event.request.formData();
		const parsed = v.safeParse(v.object({ photoId: PhotoId, role: v.string() }), {
			photoId: form.get('photoId'),
			role: form.get('role') ?? ''
		});
		if (!parsed.success)
			return fail(400, { photoError: say(event.locals, 'errors.photo.unreadable') });
		try {
			if (
				!(await setCirclePhotoRole(event.locals.services.circles.circlePhotoDeps, viewer, {
					circleId,
					...parsed.output
				}))
			) {
				return fail(404, { photoError: say(event.locals, 'errors.photo.notFound') });
			}
		} catch (err) {
			if (err instanceof UnknownPhotoRoleError)
				return fail(400, { photoError: err.phrase(translator(event.locals)) });
			throw err;
		}
		return saved;
	},

	pinPhoto: async (event) => {
		const { viewer, circleId } = await circleOf(event);
		const form = await event.request.formData();
		const parsed = v.safeParse(
			v.object({ photoId: PhotoId, pinned: v.picklist(['true', 'false']) }),
			{
				photoId: form.get('photoId'),
				pinned: form.get('pinned')
			}
		);
		if (!parsed.success)
			return fail(400, { photoError: say(event.locals, 'errors.photo.unreadable') });
		const input = {
			circleId,
			photoId: parsed.output.photoId,
			pinned: parsed.output.pinned === 'true'
		};
		if (!(await pinCirclePhoto(event.locals.services.circles.circlePhotoDeps, viewer, input))) {
			return fail(404, { photoError: say(event.locals, 'errors.photo.notFound') });
		}
		return saved;
	},

	setPhotoVisibility: async (event) => {
		const { viewer, circleId } = await circleOf(event);
		const form = await event.request.formData();
		const parsed = v.safeParse(
			v.object({ photoId: PhotoId, visibility: v.picklist(['shared', 'private']) }),
			{
				photoId: form.get('photoId'),
				visibility: form.get('visibility')
			}
		);
		if (!parsed.success)
			return fail(400, { photoError: say(event.locals, 'errors.photo.unreadable') });
		if (
			!(await setCirclePhotoVisibility(event.locals.services.circles.circlePhotoDeps, viewer, {
				circleId,
				...parsed.output
			}))
		) {
			return fail(403, { photoError: say(event.locals, 'errors.photo.onlyOwnerChange') });
		}
		return saved;
	},

	/**
	 * Cut someone's profile picture out of the photo (concept §5.1). The lightbox sends the
	 * square and its rendering, then offers the next person; Remove and Make private warn first.
	 */
	cutProfilePicture: async (event) => {
		const { viewer } = await circleOf(event);
		const input = await readCutForm(await event.request.formData());
		if (!input) return fail(400, { photoError: say(event.locals, 'errors.photo.unreadable') });
		try {
			if (!(await cutProfilePicture(event.locals.services.circles.cutDeps, viewer, input))) {
				return fail(404, { photoError: say(event.locals, 'errors.photo.notFound') });
			}
		} catch (err) {
			if (err instanceof InvalidAvatarError)
				return fail(400, { photoError: err.phrase(translator(event.locals)) });
			throw err;
		}
		return { cutFor: input.contactId };
	},

	/** The one who added it, or an admin on a shared one; the page holds it for the undo. */
	removePhoto: async (event) => {
		const remover = requireRemover(event.locals);
		const { circleId } = await circleOf(event);
		const form = await event.request.formData();
		const photoId = form.get('photoId');
		if (typeof photoId !== 'string' || photoId === '') {
			return fail(400, { photoError: say(event.locals, 'errors.photo.unreadable') });
		}
		if (
			!(await removeCirclePhoto(event.locals.services.circles.circlePhotoDeps, remover, {
				circleId,
				photoId
			}))
		) {
			return fail(403, { photoError: say(event.locals, 'errors.photo.onlyOwnerRemove') });
		}
		return saved;
	}
} satisfies Actions;
