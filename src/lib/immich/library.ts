/*
 * The whole Immich library as the photo picker beside an upload browses it (docs/dev/02 §2.24.9), as
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
	| {
			state: 'month';
			/** The month on the camera's clock, `YYYY-MM`. */
			month: string;
			/** A page of its photos, oldest first; may be short, or empty, with more to come. */
			photos: LibraryPhoto[];
			/** Where the next page starts, or null once the month is read to its end. */
			nextCursor: string | null;
	  }
	| {
			state: 'album';
			/** Immich's id for the album. */
			album: string;
			/** A page of its photos, oldest first. */
			photos: LibraryPhoto[];
			/** Where the next page starts, or null once the album is read to its end. */
			nextCursor: string | null;
	  }
	| { state: 'found'; photos: LibraryPhoto[] }
	/** The library runs without machine learning, so there is no search by description. */
	| { state: 'searchOff' }
	| { state: 'unreachable' };

/** A month of the timeline and how many assets it holds — videos included, so approximate. */
export interface LibraryMonth {
	/** `YYYY-MM`, on the camera's clock. */
	month: string;
	count: number;
}

/**
 * The timeline's months for the years overview, newest first, as `/immich/library/months` answers;
 * `forbidden` when the key lacks `timeline.read` — the picker then shows days only.
 */
export type LibraryMonths =
	{ state: 'months'; months: LibraryMonth[] } | { state: 'forbidden' } | { state: 'unreachable' };

/** An album the key's owner has or was shared, as the album list shows it. */
export interface LibraryAlbum {
	id: string;
	name: string;
	/** How many assets it holds — videos included, so approximate. */
	count: number;
	/** The days of its first and last photo, `YYYY-MM-DD`. */
	from: string;
	to: string;
	/** Its cover, signed at `thumbnail` size; null when the cover is not a timeline photo. */
	coverUrl: string | null;
}

/**
 * The albums for the picker's album list, last photo first, as `/immich/library/albums` answers;
 * `forbidden` when the key lacks `album.read` — the picker then shows the timeline only.
 */
export type LibraryAlbums =
	{ state: 'albums'; albums: LibraryAlbum[] } | { state: 'forbidden' } | { state: 'unreachable' };

/**
 * An Immich photo on a journal entry, kept as a reference (docs/dev/02 §2.20, docs/dev/04 ADR-132): both
 * URLs signed for the reader's household, or null when Immich is not on the instance any more.
 */
export interface EntryImmichPhoto {
	/** Immich's id for the photo, which keys it on the entry. */
	assetId: string;
	thumbnailUrl: string | null;
	previewUrl: string | null;
}
