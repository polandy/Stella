import { immichMediaUrl } from '../../../immich/media-url';
import type { LibraryPhoto, LibraryView } from '../../../immich/library';
import type { Viewer } from '../../access/visibility';
import type { ImmichAsset, ImmichGateway } from './gateway';
import type { ImmichMediaSigner } from './signed-media';

/*
 * The whole Immich library, for the picker beside a photo upload (docs/02 §2.24.9, docs/04
 * ADR-129): every photo of a day on the camera's clock, whoever is in it, and a search by
 * description. Any member may browse it — the library is open to the household, which Settings
 * tells the admin — so a photo is signed for the viewer's household, not for a contact, and the
 * proxy checks nothing more. A copy is made in the browser from the signed preview.
 */

export interface ImmichLibraryDeps {
	gateway: Pick<ImmichGateway, 'takenAssets' | 'smartSearch'>;
	signer: ImmichMediaSigner;
}

/** Most photos a day shows; a day with more is cut, not paged — the picker takes 20 at a time. */
export const LIBRARY_DAY_LIMIT = 500;

/** How many best matches a search shows; Immich pages a smart search no further. */
export const LIBRARY_SEARCH_LIMIT = 60;

/** The longest description passed on to Immich. */
export const LIBRARY_QUERY_MAX_LENGTH = 200;

/**
 * How far an instant may lie from the camera's clock: the widest offsets (UTC−12, UTC+14). Immich
 * filters on the instant, so a day on the clock is asked for this much wider on each side.
 */
const MAX_OFFSET_MS = 14 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** How many photos one step of the neighbours' search reads, and how many steps it takes at most. */
const NEIGHBOUR_PAGE = 100;
const NEIGHBOUR_PAGES = 5;

/**
 * Every photo taken on `day` (`YYYY-MM-DD`, on the camera's clock), oldest first, and the nearest
 * earlier and later day that has any — for ‹ ›. Any failure in Immich reads as "Immich didn't
 * answer"; Settings names what is wrong.
 */
export async function readLibraryDay(
	deps: ImmichLibraryDeps,
	viewer: Viewer,
	day: string
): Promise<LibraryView> {
	const start = Date.parse(`${day}T00:00:00Z`);
	const instant = (ms: number) => new Date(ms).toISOString();
	const [photos, earlier, later] = await Promise.all([
		deps.gateway.takenAssets(
			{ from: instant(start - MAX_OFFSET_MS), before: instant(start + DAY_MS + MAX_OFFSET_MS) },
			'oldest',
			LIBRARY_DAY_LIMIT,
			null
		),
		nearestDay(
			deps,
			{ from: null, before: instant(start + MAX_OFFSET_MS) },
			'newest',
			(other) => other < day
		),
		nearestDay(
			deps,
			{ from: instant(start + DAY_MS - MAX_OFFSET_MS), before: null },
			'oldest',
			(other) => other > day
		)
	]);
	if (!photos.ok || !earlier.ok || !later.ok) return { state: 'unreachable' };
	const ofTheDay = photos.value.assets.filter((asset) => dayOf(asset) === day);
	return {
		state: 'day',
		day,
		photos: await signed(deps, viewer, ofTheDay),
		earlier: earlier.day,
		later: later.day
	};
}

/**
 * The photos that best match a description, best first; `searchOff` when the library runs
 * without machine learning. An empty description finds nothing, and asks Immich nothing.
 */
export async function searchLibrary(
	deps: ImmichLibraryDeps,
	viewer: Viewer,
	query: string
): Promise<LibraryView> {
	const description = query.trim().slice(0, LIBRARY_QUERY_MAX_LENGTH);
	if (description === '') return { state: 'found', photos: [] };
	const found = await deps.gateway.smartSearch(description, LIBRARY_SEARCH_LIMIT);
	if (!found.ok) return { state: 'unreachable' };
	if (!found.value.enabled) return { state: 'searchOff' };
	return { state: 'found', photos: await signed(deps, viewer, found.value.assets) };
}

/**
 * When a copy made from the library was taken: what Immich said, as signed into the preview it
 * was made from (docs/02 §2.24.9) — not what the browser sends. Null for a token that is not a
 * preview of this household's library, and when Immich did not say.
 */
export async function libraryCopyTakenAt(
	signer: ImmichMediaSigner,
	viewer: Viewer,
	token: string
): Promise<string | null> {
	const verified = await signer.verify(token);
	if (!verified.ok) return null;
	const { media } = verified;
	if (media.kind !== 'library' || media.householdId !== viewer.householdId) return null;
	return media.size === 'preview' ? (media.takenAt ?? null) : null;
}

/** The day a photo was taken on the camera's clock, or null when Immich does not say. */
const dayOf = (asset: ImmichAsset) => asset.takenAt?.slice(0, 10) ?? null;

/**
 * The first day past `day` in `order` that has a photo: the photos of the window are read in the
 * camera's order, and those of the day itself — maybe hundreds — are stepped over, a page at a
 * time, a bounded number of pages.
 */
async function nearestDay(
	deps: ImmichLibraryDeps,
	window: { from: string | null; before: string | null },
	order: 'oldest' | 'newest',
	isPast: (other: string) => boolean
): Promise<{ ok: true; day: string | null } | { ok: false }> {
	let cursor: string | null = null;
	for (let page = 0; page < NEIGHBOUR_PAGES; page++) {
		const listed = await deps.gateway.takenAssets(window, order, NEIGHBOUR_PAGE, cursor);
		if (!listed.ok) return { ok: false };
		const next = listed.value.assets.map(dayOf).find((other) => other !== null && isPast(other));
		if (next) return { ok: true, day: next };
		cursor = listed.value.nextCursor;
		if (cursor === null) break;
	}
	return { ok: true, day: null };
}

/** The photos with their URLs, signed for the viewer's household; the preview carries the date. */
function signed(
	deps: ImmichLibraryDeps,
	viewer: Viewer,
	assets: readonly ImmichAsset[]
): Promise<LibraryPhoto[]> {
	return Promise.all(
		assets.map(async ({ id, takenAt }) => {
			const photo = { kind: 'library', householdId: viewer.householdId, assetId: id } as const;
			const [thumbnail, preview] = await Promise.all([
				deps.signer.sign({ ...photo, size: 'thumbnail' }),
				deps.signer.sign({ ...photo, size: 'preview', ...(takenAt === null ? {} : { takenAt }) })
			]);
			return {
				id,
				takenAt,
				thumbnailUrl: immichMediaUrl(thumbnail),
				previewUrl: immichMediaUrl(preview)
			};
		})
	);
}
