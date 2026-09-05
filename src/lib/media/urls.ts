/*
 * Where a stored photo is served from (docs/02 §2.14). One builder, so the avatar component,
 * the story photos and the explorer canvas all point at the same route and a route change is
 * a one-line edit.
 */

/** The full-size image. */
export function mediaUrl(photoId: string): string {
	return `/media/${photoId}`;
}

/** The thumbnail, as avatars and previews load it. */
export function thumbnailUrl(photoId: string): string {
	return `${mediaUrl(photoId)}?thumb`;
}
