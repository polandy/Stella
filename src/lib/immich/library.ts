/*
 * The whole Immich library as the photo picker beside an upload browses it (docs/02 §2.24.9), as
 * the browser receives it from `/immich/library`. Shared by the server, which builds it, and the
 * picker, which shows it.
 */

/** One photo the picker offers. */
export interface LibraryPhoto {
	/** Immich's id for the photo, which keys it in the grid and in the picked order. */
	id: string;
	/** When it was taken, as Stella keeps a capture date; null when Immich does not say. */
	takenAt: string | null;
	/** Signed, at Immich's `thumbnail` size: the grid's tile. */
	thumbnailUrl: string;
	/** Signed, at Immich's `preview` size: what the copy is made from. */
	previewUrl: string;
}

/** What the picker shows, or why it shows nothing. */
export type LibraryView =
	| {
			state: 'day';
			/** The day on the camera's clock, `YYYY-MM-DD`. */
			day: string;
			photos: LibraryPhoto[];
			/** The nearest earlier and later day that has photos, or null when there is none. */
			earlier: string | null;
			later: string | null;
	  }
	| { state: 'found'; photos: LibraryPhoto[] }
	/** The library runs without machine learning, so there is no search by description. */
	| { state: 'searchOff' }
	| { state: 'unreachable' };
