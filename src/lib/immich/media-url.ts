/*
 * Where the browser asks for an image from Immich: Stella's own signed proxy, which fetches it
 * with the key the browser never sees (docs/concepts/immich.md §2 point 3, §5). The one place
 * this URL is spelled; the route lives at `src/routes/media/immich/[token]`, and the token is
 * issued by `src/lib/server/domain/immich/signed-media.ts`.
 */

/** The path every image from Immich is served under; the service worker never keeps one. */
export const IMMICH_MEDIA_PATH = '/media/immich';

/** An image from Immich, through Stella, for a signed token. */
export function immichMediaUrl(token: string): string {
	return `${IMMICH_MEDIA_PATH}/${encodeURIComponent(token)}`;
}

/** The token a URL from `immichMediaUrl` carries, or null when it is not one of the proxy's. */
export function immichMediaToken(url: string): string | null {
	const prefix = `${IMMICH_MEDIA_PATH}/`;
	if (!url.startsWith(prefix)) return null;
	const segment = url.slice(prefix.length);
	if (segment === '' || segment.includes('/')) return null;
	try {
		return decodeURIComponent(segment);
	} catch {
		return null;
	}
}
