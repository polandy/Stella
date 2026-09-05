import { error, json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth/guards';
import { getConfig } from '$lib/server/config';
import { previewMonicaDump } from '$lib/server/domain/import/monica/apply';
import { attachImportedPhoto } from '$lib/server/domain/import/monica/photos';
import { InvalidImageError } from '$lib/server/domain/media/journal-photos';
import { readStagedDump } from '$lib/server/import/staging';
import { getImportDeps, getImportedPhotoDeps } from '$lib/server/services';
import type { RequestHandler } from './$types';

/*
 * One imported photo per request (docs/02 §2.16): the browser matched a file in Monica's
 * storage folder to a photo of the plan, downscaled it, and sends image + thumb with the
 * staging token. The plan is re-derived from the staged dump, so the photo id decides which
 * contact it belongs to and whether it becomes the avatar — the browser cannot choose that.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = requireAdmin(locals);
	const form = await request.formData();
	const token = form.get('token');
	const photoId = form.get('photoId');
	const image = form.get('image');
	const thumb = form.get('thumb');
	const visibility = form.get('visibility') === 'private' ? 'private' : 'shared';
	if (typeof token !== 'string' || typeof photoId !== 'string' || !(image instanceof File) || !(thumb instanceof File)) {
		throw error(400, 'Missing photo upload fields.');
	}

	const text = await readStagedDump(getConfig().importDir, token);
	if (text === null) throw error(410, 'The import session is over; start again from the dump.');
	const plan = previewMonicaDump(getImportDeps(), text, { householdId: user.householdId, userId: user.id, visibility });
	const planned = plan.photos.find((p) => p.id === photoId);
	if (!planned) throw error(404, 'This photo is not part of the import.');

	try {
		const status = await attachImportedPhoto(getImportedPhotoDeps(), {
			photoId: planned.id,
			contactId: planned.contactId,
			householdId: user.householdId,
			userId: user.id,
			visibility,
			isAvatar: planned.isAvatar,
			upload: {
				image: new Uint8Array(await image.arrayBuffer()),
				thumb: new Uint8Array(await thumb.arrayBuffer()),
				width: Number(form.get('width')),
				height: Number(form.get('height'))
			}
		});
		return json({ status });
	} catch (err) {
		if (err instanceof InvalidImageError) throw error(400, err.message);
		throw err;
	}
};
