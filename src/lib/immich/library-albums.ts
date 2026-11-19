import type { LibraryAlbum } from './library';
import type { LibraryLevel } from './library-nav';

/*
 * How the photo picker offers the Immich albums beside the timeline (docs/dev/02 §2.24.9). Pure:
 * the sheet renders these decisions.
 */

/** From how many albums on the list offers a filter by name. */
export const ALBUM_FILTER_FROM = 12;

/** The picker's two ways in: the timeline, or the albums. */
export type LibraryTab = 'time' | 'albums';

const fold = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** The albums whose name holds every word of `filter`, ignoring case and accents. */
export function albumsNamed(albums: readonly LibraryAlbum[], filter: string): LibraryAlbum[] {
	const words = fold(filter).split(/\s+/).filter(Boolean);
	return albums.filter((album) => words.every((word) => fold(album.name).includes(word)));
}

/** Whether the list is long enough for a filter by name. */
export const showsAlbumFilter = (albums: number): boolean => albums >= ALBUM_FILTER_FROM;

/** The tab a level belongs to. */
export const tabOf = (at: LibraryLevel): LibraryTab =>
	at.level === 'albums' || at.level === 'album' ? 'albums' : 'time';
