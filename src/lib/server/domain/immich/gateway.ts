/*
 * What Stella asks of Immich, and how Immich's answers are read (docs/dev/04 §4.3, ADR-101). The
 * port is narrow and owned here; `src/lib/server/immich/http-gateway.ts` implements it over HTTP
 * and `fake-gateway.ts` in memory. Every answer is untrusted, so `gateway-payloads.ts` reads it.
 */

/** A server version, as `GET /api/server/version` reports it. */
export interface ImmichVersion {
	major: number;
	minor: number;
	patch: number;
}

/** The Immich account the API key belongs to (`GET /api/users/me`). */
export interface ImmichOwner {
	name: string;
	email: string;
}

/** A person in the key owner's library — a face Immich grouped, and maybe named. */
export interface ImmichPerson {
	id: string;
	/** Empty when nobody has named the face yet. */
	name: string;
	/** Hidden in Immich: never offered by Stella (docs/dev/02 §2.24.2). */
	hidden: boolean;
}

/** One page of `GET /api/people`. */
export interface ImmichPeoplePage {
	people: ImmichPerson[];
	hasNextPage: boolean;
}

/** How many photos a person is in (`GET /api/people/{id}/statistics`). */
export interface ImmichStatistics {
	assets: number;
}

/** A photo in the library, as the glimpse needs it (docs/dev/02 §2.24.3). */
export interface ImmichAsset {
	id: string;
	/**
	 * When it was taken, in the shape Stella keeps a capture date in (`../../../image/taken-at`):
	 * the camera's wall clock where it was taken, or an instant in UTC when Immich only knows the
	 * file's; null when Immich does not say.
	 */
	takenAt: string | null;
}

/** One page of a person's latest photos, and where the next page starts. */
export interface ImmichAssetPage {
	assets: ImmichAsset[];
	/** Immich's opaque cursor for the next page, or null on the last one. */
	nextCursor: string | null;
}

/**
 * A stretch of time photos were taken in, as instants in UTC (`…Z`): from `from` on, and before
 * `before`; null leaves that end open. Immich filters on when the file was made, an instant — not
 * on the camera's clock — so a caller after one day on that clock widens the window and reads
 * each photo's `takenAt` (docs/dev/02 §2.24.9).
 */
export interface ImmichTakenWindow {
	from: string | null;
	before: string | null;
}

/**
 * One month of the timeline (`GET /api/timeline/buckets`): `YYYY-MM` on the camera's clock, and how
 * many assets Immich counts in it — videos too, so a count of photos is only about this many.
 */
export interface ImmichTimelineMonth {
	month: string;
	count: number;
}

/**
 * An album the key's owner sees in Immich — their own and those shared with them (`GET /api/albums`).
 * `from` and `to` are the days its first and last photo were taken (`YYYY-MM-DD`); an empty album
 * has none, and no cover.
 */
export interface ImmichAlbum {
	id: string;
	name: string;
	/** How many assets it holds — videos too, so a count of photos is only about this many. */
	count: number;
	coverAssetId: string | null;
	from: string | null;
	to: string | null;
}

/** A smart search's answer: the photos that match best, or that the library has it switched off. */
export type ImmichSmartSearch = { enabled: true; assets: ImmichAsset[] } | { enabled: false };

/**
 * Whose photos a listing asks for: the photos any of these people is in, or — the together-view
 * of docs/dev/02 §2.24.8 — only those all of them are in (Immich's `personIds.any` / `personIds.all`).
 */
export interface ImmichPeopleFilter {
	personIds: readonly string[];
	match: 'any' | 'all';
}

/** The two sizes Immich renders a photo at, and the only ones Stella asks for. */
export type ImmichImageSize = 'thumbnail' | 'preview';

/** An image Immich sent, read whole: a face thumbnail is a few kilobytes, a preview a few hundred. */
export interface ImmichImage {
	bytes: Uint8Array<ArrayBuffer>;
	contentType: string;
}

/**
 * Why a call did not answer. The three statuses Immich uses for a key that cannot do what was
 * asked are outcomes, not exceptions — Settings has a sentence for each (docs/dev/02 §2.24.1):
 * - `unauthorized`: the key was refused outright (revoked, or mistyped) — 401;
 * - `forbidden`: the key is valid but lacks the scope this call needs — 403;
 * - `notFound`: the person asked for is not (any more) in the library;
 * - `unreachable`: no usable answer at all — down, timed out, a 5xx, or a body we cannot read.
 */
export type ImmichFailure = 'unauthorized' | 'forbidden' | 'notFound' | 'unreachable';

/** A call's answer, or the reason there is none. */
export type ImmichOutcome<T> = { ok: true; value: T } | { ok: false; failure: ImmichFailure };

/** The calls Stella makes (docs/dev/04 §4.3). Implemented at the edge; faked in tests. Never throws. */
export interface ImmichGateway {
	/** The server's version; needs no scope. */
	version(): Promise<ImmichOutcome<ImmichVersion>>;
	/** Whose library the key reads (`user.read`). */
	owner(): Promise<ImmichOutcome<ImmichOwner>>;
	/** A page of the library's people, 1-based (`person.read`). */
	listPeople(page: number, size: number): Promise<ImmichOutcome<ImmichPeoplePage>>;
	/** The people whose name matches (`person.read`). */
	searchPeople(name: string): Promise<ImmichOutcome<ImmichPerson[]>>;
	/** One person by id (`person.read`). */
	person(id: string): Promise<ImmichOutcome<ImmichPerson>>;
	/** How many photos one person is in (`person.statistics`). */
	personStatistics(id: string): Promise<ImmichOutcome<ImmichStatistics>>;
	/** One person's face (`person.read`). */
	personThumbnail(id: string): Promise<ImmichOutcome<ImmichImage>>;
	/**
	 * The latest photos of some people in the timeline, newest first (`asset.read`): `limit` of
	 * them, from `cursor` on (null for the first page). Archived, locked and trashed photos never
	 * come. No people, or an id that is not Immich's, is `notFound` without asking.
	 */
	latestAssets(
		people: ImmichPeopleFilter,
		limit: number,
		cursor: string | null
	): Promise<ImmichOutcome<ImmichAssetPage>>;
	/**
	 * Every photo in the timeline taken within `window`, whoever is in it (`asset.read`), in the
	 * order of the camera's clock — `oldest` or `newest` first — `limit` of them from `cursor` on.
	 * Archived, locked and trashed photos never come.
	 */
	takenAssets(
		window: ImmichTakenWindow,
		order: 'oldest' | 'newest',
		limit: number,
		cursor: string | null
	): Promise<ImmichOutcome<ImmichAssetPage>>;
	/**
	 * The photos in the timeline that best match a description, best first (`asset.read`): Immich's
	 * smart search (CLIP). One page only — Immich pages it no further. `enabled: false` when the
	 * library runs without machine learning.
	 */
	smartSearch(query: string, limit: number): Promise<ImmichOutcome<ImmichSmartSearch>>;
	/**
	 * Every month of the timeline that has anything in it, with its count (`timeline.read`).
	 * Archived and locked assets are not counted.
	 */
	timelineMonths(): Promise<ImmichOutcome<ImmichTimelineMonth[]>>;
	/** Every album the key's owner sees, their own and those shared with them (`album.read`). */
	albums(): Promise<ImmichOutcome<ImmichAlbum[]>>;
	/**
	 * The photos of one album in the timeline, oldest first by the camera's clock (`asset.read`),
	 * `limit` of them from `cursor` on. An album Immich does not have, or an id that is not
	 * Immich's, is `notFound`.
	 */
	albumAssets(
		albumId: string,
		limit: number,
		cursor: string | null
	): Promise<ImmichOutcome<ImmichAssetPage>>;
	/**
	 * One photo, when it is one Stella may show: an image in the timeline (`asset.read`). Archived,
	 * locked, trashed or not there at all is `notFound`.
	 */
	timelinePhoto(assetId: string): Promise<ImmichOutcome<ImmichAsset>>;
	/** One photo, at one of the sizes Immich renders (`asset.view`). */
	assetImage(assetId: string, size: ImmichImageSize): Promise<ImmichOutcome<ImmichImage>>;
}

/**
 * The image types a face may be passed on as. SVG is not among them: it can carry script, and
 * these bytes are served from Stella's own origin.
 */
const SERVABLE_IMAGE_TYPES: ReadonlySet<string> = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/avif',
	'image/gif'
]);

/** Whether an image Immich sent may be served from Stella's origin as it is. */
export function isServableImageType(contentType: string): boolean {
	return SERVABLE_IMAGE_TYPES.has(contentType);
}

/** The read scopes the key needs, named as Immich names them (docs/dev/02 §2.24.1). */
export type ImmichScope =
	'user.read' | 'person.read' | 'person.statistics' | 'asset.read' | 'asset.view';

/** Scopes a feature needs that Stella can do without: lacking one hides only that feature. */
export type ImmichOptionalScope = 'timeline.read' | 'album.read';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a value is an Immich id. Ids travel into URL paths — Immich's and Stella's own
 * thumbnail route — so anything but a UUID is refused rather than escaped: a `..` must never
 * reach `/api/people/{id}`.
 */
export function isImmichId(value: unknown): value is string {
	return typeof value === 'string' && UUID.test(value);
}

/** The longest cursor passed back to Immich; its own are far shorter. */
const MAX_CURSOR_LENGTH = 512;

/** Whether a value can be passed back to Immich as a page cursor: opaque, but bounded. */
export function isAssetCursor(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		value !== '' &&
		value.length <= MAX_CURSOR_LENGTH &&
		!/[\u0000-\u001f]/.test(value)
	);
}
