import { error, json } from '@sveltejs/kit';
import { decodeDataUrl } from '$lib/media/data-url';
import type { Visibility } from '$lib/server/access/visibility';
import { requireAdmin } from '$lib/server/auth/guards';
import { getConfig } from '$lib/server/config';
import { previewImport } from '$lib/server/domain/import/apply';
import { attachImportedPhoto } from '$lib/server/domain/import/monica/photos';
import { InvalidImageError } from '$lib/server/domain/media/journal-photos';
import { readStagedDump } from '$lib/server/import/staging';
import { getImportDeps, getImportedPhotoDeps } from '$lib/server/services';
import type { RequestHandler } from './$types';
import { importWording } from '$lib/server/i18n/import-wording';
import { say, translator } from '$lib/server/i18n/say';

/*
 * One imported photo per request (docs/02 §2.16). The plan is re-derived from the staged
 * export on every request, so the photo id decides which contact it belongs to and whether it
 * becomes the avatar — the browser cannot choose that.
 *
 * POST takes the finished renditions: the browser found the picture (in Monica's storage
 * folder for a dump, or from GET below for a JSON export) and downscaled it, because the
 * server has no image library.
 *
 * GET hands the original back out for exactly that: a JSON export carries its pictures inside
 * the file, so there is no folder for the admin to point at.
 */

/** The plan behind a staging token, or the HTTP error that says why there is none. */
async function planFor(
	token: string,
	user: { householdId: string; id: string },
	visibility: Visibility,
	locals: App.Locals
) {
	const text = await readStagedDump(getConfig().importDir, token);
	if (text === null) throw error(410, say(locals, 'import.error.sessionOver'));
	return previewImport(getImportDeps(), text, {
		householdId: user.householdId,
		userId: user.id,
		visibility,
		wording: importWording(locals)
	});
}

export const GET: RequestHandler = async ({ url, locals }) => {
	const user = requireAdmin(locals);
	const token = url.searchParams.get('token');
	const photoId = url.searchParams.get('photoId');
	if (!token || !photoId) throw error(400, say(locals, 'import.error.missingToken'));

	// Nothing about a picture depends on the visibility the admin chose, so reading one asks
	// for the household default rather than carrying a setting through the URL.
	const planned = (await planFor(token, user, 'shared', locals)).photos.find((p) => p.id === photoId);
	if (!planned) throw error(404, say(locals, 'import.error.photoNotInImport'));
	if (planned.dataUrl === null) {
		throw error(409, say(locals, 'import.error.pictureNotCarried'));
	}

	const { bytes, mime } = decodeDataUrl(planned.dataUrl);
	return new Response(bytes.buffer as ArrayBuffer, {
		headers: { 'content-type': mime, 'cache-control': 'no-store' }
	});
};
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = requireAdmin(locals);
	const form = await request.formData();
	const token = form.get('token');
	const photoId = form.get('photoId');
	const image = form.get('image');
	const thumb = form.get('thumb');
	const visibility = form.get('visibility') === 'private' ? 'private' : 'shared';
	if (typeof token !== 'string' || typeof photoId !== 'string' || !(image instanceof File) || !(thumb instanceof File)) {
		throw error(400, say(locals, 'import.error.missingPhotoFields'));
	}

	const plan = await planFor(token, user, visibility, locals);
	const planned = plan.photos.find((p) => p.id === photoId);
	if (!planned) throw error(404, say(locals, 'import.error.photoNotInImport'));

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
		if (err instanceof InvalidImageError) throw error(400, err.phrase(translator(locals)));
		throw err;
	}
};
