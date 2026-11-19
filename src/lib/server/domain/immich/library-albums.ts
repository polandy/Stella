import { immichMediaUrl } from '../../../immich/media-url';
import type { LibraryAlbum, LibraryAlbums, LibraryView } from '../../../immich/library';
import type { Viewer } from '../../access/visibility';
import type { ImmichAlbum } from './gateway';
import { signLibraryPhotos, type ImmichLibraryDeps } from './library';

/*
 * The albums as the photo picker walks them (docs/dev/02 §2.24.9): the key owner's own and shared
 * albums, last photo first, and an album read a page at a time. The proxy signs any asset, so a
 * cover is checked to be a timeline photo first — an archived or locked one stays hidden.
 */

/** How many photos one page of an album reads from Immich. */
export const LIBRARY_ALBUM_PAGE = 100;

/** How many covers are checked with Immich at once. */
const COVER_CHECKS_AT_ONCE = 8;

/**
 * The albums that hold photos, last photo first, then by name. A key without `album.read` is
 * `forbidden`: the picker leaves the albums out and keeps the timeline.
 */
export async function readLibraryAlbums(
	deps: ImmichLibraryDeps,
	viewer: Viewer
): Promise<LibraryAlbums> {
	const listed = await deps.gateway.albums();
	if (!listed.ok) return { state: listed.failure === 'forbidden' ? 'forbidden' : 'unreachable' };
	const held = listed.value
		.flatMap(({ from, to, ...album }) =>
			from !== null && to !== null && album.count > 0 ? [{ ...album, from, to }] : []
		)
		.sort((a, b) => b.to.localeCompare(a.to) || a.name.localeCompare(b.name));
	const albums: LibraryAlbum[] = [];
	for (let start = 0; start < held.length; start += COVER_CHECKS_AT_ONCE) {
		const batch = held.slice(start, start + COVER_CHECKS_AT_ONCE);
		albums.push(...(await Promise.all(batch.map((album) => withCover(deps, viewer, album)))));
	}
	return { state: 'albums', albums };
}

/**
 * One page of the photos in album `albumId`, oldest first, from `cursor` on. Any failure — an
 * album gone or no longer shared included — reads as "Immich didn't answer".
 */
export async function readLibraryAlbum(
	deps: ImmichLibraryDeps,
	viewer: Viewer,
	albumId: string,
	cursor: string | null
): Promise<LibraryView> {
	const listed = await deps.gateway.albumAssets(albumId, LIBRARY_ALBUM_PAGE, cursor);
	if (!listed.ok) return { state: 'unreachable' };
	return {
		state: 'album',
		album: albumId,
		photos: await signLibraryPhotos(deps.signer, viewer, listed.value.assets),
		nextCursor: listed.value.nextCursor
	};
}

async function withCover(
	deps: ImmichLibraryDeps,
	viewer: Viewer,
	{ id, name, count, from, to, coverAssetId }: ImmichAlbum & { from: string; to: string }
): Promise<LibraryAlbum> {
	const album = { id, name, count, from, to, coverUrl: null };
	if (coverAssetId === null) return album;
	const checked = await deps.gateway.timelinePhoto(coverAssetId);
	if (!checked.ok) return album;
	const token = await deps.signer.sign({
		kind: 'library',
		householdId: viewer.householdId,
		assetId: checked.value.id,
		size: 'thumbnail'
	});
	return { ...album, coverUrl: immichMediaUrl(token) };
}
