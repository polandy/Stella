import { error } from '@sveltejs/kit';
import { getMediaStore, getPhotos } from '$lib/server/services';
import type { RequestHandler } from './$types';
import { say } from '$lib/server/i18n/say';

/*
 * Authenticated media delivery (docs/04 §4.6). Media is never exposed as static files; every
 * request re-checks visibility through the PhotoRepository (contact visible + photo shared-or-
 * owned, §3.7) so private media can't leak. `?thumb` serves the small variant, `?view`
 * a group photo's 1600 px view. Files are
 * id-addressed and immutable, so they cache aggressively but privately.
 */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) throw error(401, say(locals, 'errors.notSignedIn'));
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };
	const variant = url.searchParams.has('thumb')
		? 'thumb'
		: url.searchParams.has('view')
			? 'view'
			: 'full';

	const file = await getPhotos().getVisiblePhotoFile(viewer, params.id, variant);
	if (!file) throw error(404, say(locals, 'errors.notFound'));

	// Streamed from disk rather than read into memory first: a full-size photo is megabytes.
	const opened = await getMediaStore().open(file.path);
	if (!opened) throw error(404, say(locals, 'errors.notFound'));

	return new Response(opened.body, {
		headers: {
			'Content-Type': file.mime,
			'Content-Length': String(opened.size),
			'Cache-Control': 'private, max-age=31536000, immutable'
		}
	});
};
