import { error } from '@sveltejs/kit';
import { getMediaStore, getPhotos } from '$lib/server/services';
import type { RequestHandler } from './$types';

/*
 * Authenticated media delivery (docs/04 §4.6). Media is never exposed as static files; every
 * request re-checks visibility through the PhotoRepository (contact visible + photo shared-or-
 * owned, §3.7) so private media can't leak. `?thumb` serves the small variant. Files are
 * id-addressed and immutable, so they cache aggressively but privately.
 */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };
	const variant = url.searchParams.has('thumb') ? 'thumb' : 'full';

	const file = await getPhotos().getVisiblePhotoFile(viewer, params.id, variant);
	if (!file) throw error(404, 'Not found');

	const bytes = await getMediaStore().read(file.path);
	if (!bytes) throw error(404, 'Not found');

	// The bytes are a Uint8Array; Bun's Response accepts it at runtime (the DOM lib type for
	// BodyInit is stricter about the backing buffer, hence the cast).
	return new Response(bytes as unknown as BodyInit, {
		headers: {
			'Content-Type': file.mime,
			'Content-Length': String(bytes.byteLength),
			'Cache-Control': 'private, max-age=31536000, immutable'
		}
	});
};
