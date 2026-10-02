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

/**
 * The 1600 px view a group photo keeps beside its larger full picture (docs/02 §2.4.2) — what
 * its grid and lightbox load. Any other photo answers with its full picture.
 */
export function viewUrl(photoId: string): string {
	return `${mediaUrl(photoId)}?view`;
}
