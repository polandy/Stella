/*
 * The strip of a linked person's latest photos from Immich (docs/concepts/immich.md §4.3), as the
 * browser receives it from `/contacts/{id}/immich/photos`. Shared by the server, which builds it,
 * and the Photos card, which shows it; pure, so the one decision in it is tested without either.
 */

/** One photo in the strip. */
export interface GlimpsePhoto {
	/** Immich's id for the photo, which keys it in the strip. */
	id: string;
	/** The day it was taken (`YYYY-MM-DD`), or null when Immich does not say. */
	takenOn: string | null;
	/** Signed, at Immich's `thumbnail` size: the strip's tile. */
	thumbnailUrl: string;
	/** Signed, at Immich's `preview` size: the viewer's picture. */
	previewUrl: string;
	/** The photo in Immich's web app, for every member who sees the person (concept §9.2). */
	openUrl: string;
}

/** A page of the strip, or why there is none. */
export type ImmichGlimpse =
	| { state: 'photos'; photos: GlimpsePhoto[]; nextCursor: string | null }
	| { state: 'personGone' }
	| { state: 'unreachable' };

/**
 * The strip once *Show more* brought the next page. A photo added in Immich between the two pages
 * pushes the last one of the first page onto the second; it is shown once, where it already is.
 */
export function withPage(
	shown: readonly GlimpsePhoto[],
	page: readonly GlimpsePhoto[]
): GlimpsePhoto[] {
	const seen = new Set(shown.map((photo) => photo.id));
	return [...shown, ...page.filter((photo) => !seen.has(photo.id))];
}
