import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import type { ImmichAlbum } from './gateway';
import type { ImmichLibraryDeps } from './library';
import { LIBRARY_ALBUM_PAGE, readLibraryAlbum, readLibraryAlbums } from './library-albums';
import { createImmichMediaSigner } from './signed-media';
import { libraryOf } from './test-library';
import { fixedClock } from '../testing';
import { immichMediaToken } from '../../../immich/media-url';

/*
 * The albums as the picker walks them (docs/dev/02 §2.24.9): the list, last photo first, with a
 * cover only when it is a timeline photo, and an album read a page at a time, oldest first.
 */

const viewer: Viewer = { id: 'u-anna', householdId: 'h1' };
const signer = createImmichMediaSigner({
	secret: 'test-secret',
	clock: fixedClock(1_700_000_000_000)
});

const A = '0a000000-0000-4000-8000-000000000000';
const asset = (n: number) => `${n.toString(16).padStart(8, '0')}${A.slice(8)}`;
const albumId = (n: number) => `ab000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

function album(
	n: number,
	name: string,
	from: string | null,
	to: string | null,
	cover: string | null
): ImmichAlbum {
	return { id: albumId(n), name, count: from === null ? 0 : 3, coverAssetId: cover, from, to };
}

function setup(albums: ImmichLibraryDeps['gateway']['albums'], taken: Record<string, string> = {}) {
	return { gateway: { ...libraryOf(taken), albums }, signer } satisfies ImmichLibraryDeps;
}

const coverOf = async (url: string | null) => {
	if (url === null) return null;
	const verified = await signer.verify(immichMediaToken(url) ?? '');
	return verified.ok ? verified.media : null;
};

describe('readLibraryAlbums', () => {
	it('lists the albums that hold photos, last photo first, then by name', async () => {
		const deps = setup(async () => ({
			ok: true,
			value: [
				album(1, 'Old', '2019-06-15', '2019-06-20', null),
				album(2, 'Empty', null, null, null),
				album(3, 'Beta', '2025-01-01', '2026-03-01', null),
				album(4, 'Alpha', '2026-02-01', '2026-03-01', null)
			]
		}));
		const listed = await readLibraryAlbums(deps, viewer);
		expect(listed.state === 'albums' && listed.albums.map(({ name }) => name)).toEqual([
			'Alpha',
			'Beta',
			'Old'
		]);
		expect(listed.state === 'albums' && listed.albums[2]).toEqual({
			id: albumId(1),
			name: 'Old',
			count: 3,
			from: '2019-06-15',
			to: '2019-06-20',
			coverUrl: null
		});
	});

	it('signs a cover only when it is a photo of the timeline', async () => {
		const deps = setup(
			async () => ({
				ok: true,
				value: [
					album(1, 'Shown', '2024-01-01', '2024-01-02', asset(1)),
					album(2, 'Archived cover', '2024-01-01', '2024-01-01', asset(2))
				]
			}),
			{ [asset(1)]: '2024-01-01T10:00:00' }
		);
		const listed = await readLibraryAlbums(deps, viewer);
		if (listed.state !== 'albums') throw new Error(listed.state);
		const [shown, archived] = listed.albums;
		expect(await coverOf(shown?.coverUrl ?? null)).toMatchObject({
			kind: 'library',
			householdId: 'h1',
			assetId: asset(1),
			size: 'thumbnail'
		});
		expect(archived?.coverUrl).toBeNull();
	});

	it('reads a key without album.read as forbidden, any other failure as unreachable', async () => {
		const failing = (failure: 'forbidden' | 'unreachable' | 'unauthorized') =>
			setup(async () => ({ ok: false, failure }));
		expect(await readLibraryAlbums(failing('forbidden'), viewer)).toEqual({ state: 'forbidden' });
		expect(await readLibraryAlbums(failing('unreachable'), viewer)).toEqual({
			state: 'unreachable'
		});
		expect(await readLibraryAlbums(failing('unauthorized'), viewer)).toEqual({
			state: 'unreachable'
		});
	});

	it('leaves a cover out when Immich fails to check it, and keeps the album', async () => {
		const deps = setup(async () => ({
			ok: true,
			value: [album(1, 'One', '2024-01-01', '2024-01-01', asset(1))]
		}));
		deps.gateway.timelinePhoto = async () => ({ ok: false, failure: 'unreachable' });
		const listed = await readLibraryAlbums(deps, viewer);
		expect(listed.state === 'albums' && listed.albums.map(({ coverUrl }) => coverUrl)).toEqual([
			null
		]);
	});
});

describe('readLibraryAlbum', () => {
	it('reads an album a page at a time, oldest first', async () => {
		const asked: unknown[] = [];
		const deps = setup(async () => ({ ok: true, value: [] }));
		deps.gateway.albumAssets = async (id, limit, cursor) => {
			asked.push([id, limit, cursor]);
			return {
				ok: true,
				value: { assets: [{ id: asset(1), takenAt: '2024-01-01T10:00:00' }], nextCursor: 'next' }
			};
		};
		const view = await readLibraryAlbum(deps, viewer, albumId(1), 'here');
		expect(asked).toEqual([[albumId(1), LIBRARY_ALBUM_PAGE, 'here']]);
		expect(
			view.state === 'album' && [view.album, view.photos.map(({ id }) => id), view.nextCursor]
		).toEqual([albumId(1), [asset(1)], 'next']);
	});

	it('reads any failure, an album gone included, as unreachable', async () => {
		const deps = setup(async () => ({ ok: true, value: [] }));
		expect(await readLibraryAlbum(deps, viewer, albumId(9), null)).toEqual({
			state: 'unreachable'
		});
	});
});
