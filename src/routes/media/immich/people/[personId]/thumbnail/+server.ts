import { error } from '@sveltejs/kit';
import { isImmichId } from '$lib/server/domain/immich/gateway';
import { getImmich } from '$lib/server/services';
import { say } from '$lib/server/i18n/say';
import type { RequestHandler } from './$types';

/*
 * A face from Immich, through Stella (docs/concepts/immich.md §2 point 3, §6). The browser
 * cannot fetch from Immich — an `<img>` cannot carry the key, and the key must never reach a
 * browser — so the picker's faces come from here.
 *
 * Deliberately narrow, until slice 2 brings the signed proxy for photos: it serves one thing,
 * a person's face thumbnail, to a signed-in member, for an id that is an Immich id and nothing
 * else. It never takes a path or an asset id, so it cannot be turned into a way to the rest of
 * the library. Any member may see any face: the picker offers the library's named faces to
 * every member anyway (§9.4), and a face is what the household links people by.
 */

/** A day, privately: Immich can rename, merge or delete a person, so never `immutable`. */
const CACHE_CONTROL = 'private, max-age=86400';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) throw error(401, say(locals, 'errors.notSignedIn'));
	const immich = getImmich();
	if (!immich || !isImmichId(params.personId)) throw error(404, say(locals, 'errors.notFound'));

	const face = await immich.gateway.personThumbnail(params.personId);
	if (!face.ok) {
		throw error(face.failure === 'notFound' ? 404 : 502, say(locals, 'errors.notFound'));
	}
	return new Response(face.value.bytes, {
		headers: {
			'Content-Type': face.value.contentType,
			'Content-Length': String(face.value.bytes.byteLength),
			'Cache-Control': CACHE_CONTROL,
			// The type is the one checked on the way in; the browser must not guess another.
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
