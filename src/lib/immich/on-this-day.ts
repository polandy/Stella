/*
 * *On this day* from Immich (docs/02 §2.12.1): every photo of the timeline taken on the day's day
 * and month in an earlier year, as the browser receives it from `/immich/on-this-day`. Shared by
 * the server, which builds it, and Home's band and the page, which show it.
 */

/** How many photos a year shows at first, and how many more each *Show more* adds. */
export const IMMICH_MEMORY_PAGE = 12;

/** One photo of the day, signed for the household. */
export interface ImmichMemoryPhoto {
	/** Immich's id for the photo. */
	id: string;
	/** The earlier year it was taken in, on the camera's clock. */
	year: number;
	/** When it was taken on the camera's clock (`YYYY-MM-DDTHH:MM:SS`); null when Immich does not say. */
	takenAt: string | null;
	/** Signed, at Immich's `thumbnail` size: the tile. */
	thumbnailUrl: string;
	/** Signed, at Immich's `preview` size: the lightbox. */
	previewUrl: string;
	/** The photo in Immich's own web app. */
	openUrl: string;
}

/** One earlier year's photos: the first page of them, and how many it has in all. */
export interface ImmichMemoryYear {
	year: number;
	photos: ImmichMemoryPhoto[];
	total: number;
}

/** Every earlier year with a photo of the day, newest first — or that Immich did not answer. */
export type ImmichMemories =
	{ state: 'years'; years: ImmichMemoryYear[] } | { state: 'unreachable' };

/** A further page of one year, for *Show more*. */
export type ImmichMemoryPage =
	{ state: 'photos'; photos: ImmichMemoryPhoto[] } | { state: 'unreachable' };
