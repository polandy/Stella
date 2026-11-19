import { describe, expect, it } from 'bun:test';
import type { LibraryAlbum } from './library';
import { ALBUM_FILTER_FROM, albumsNamed, showsAlbumFilter, tabOf } from './library-albums';

const album = (name: string): LibraryAlbum => ({
	id: name,
	name,
	count: 1,
	from: '2026-01-01',
	to: '2026-01-01',
	coverUrl: null
});

describe('albumsNamed', () => {
	const albums = ['Zoo Zürich', 'Sommerferien Engadin', 'Lenas Geburtstag'].map(album);

	it('keeps the albums whose name holds the words, ignoring case and accents', () => {
		expect(albumsNamed(albums, 'zur').map(({ name }) => name)).toEqual(['Zoo Zürich']);
		expect(albumsNamed(albums, '  ENGADIN ').map(({ name }) => name)).toEqual([
			'Sommerferien Engadin'
		]);
		expect(albumsNamed(albums, 'geburtstag lena').map(({ name }) => name)).toEqual([
			'Lenas Geburtstag'
		]);
	});

	it('keeps every album for an empty filter, and none for a name nobody has', () => {
		expect(albumsNamed(albums, ' ')).toEqual(albums);
		expect(albumsNamed(albums, 'Davos')).toEqual([]);
	});
});

describe('showsAlbumFilter', () => {
	it('offers the name filter from twelve albums on', () => {
		expect(ALBUM_FILTER_FROM).toBe(12);
		expect(showsAlbumFilter(11)).toBe(false);
		expect(showsAlbumFilter(12)).toBe(true);
	});
});

describe('tabOf', () => {
	it('puts the album list and an album under Albums, everything else under Time', () => {
		expect(tabOf({ level: 'albums' })).toBe('albums');
		expect(tabOf({ level: 'album', album: 'a', name: 'A' })).toBe('albums');
		expect(tabOf({ level: 'years' })).toBe('time');
		expect(tabOf({ level: 'day', day: '2026-10-21' })).toBe('time');
	});
});
