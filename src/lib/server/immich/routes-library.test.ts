import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../access/visibility';
import { CARL_ID, testLibrary } from '../domain/immich/test-library';
import { createImmichMediaSigner } from '../domain/immich/signed-media';
import { createFakeImmichGateway, fakeAssetId } from './fake-gateway';
import {
	answerLibrary,
	answerLibraryAlbums,
	answerLibraryMonths,
	IMMICH_MEDIA_CACHE_CONTROL
} from './routes';

/*
 * What the picker's library routes answer — `/immich/library`, its months and its albums
 * (docs/dev/02 §2.24.9) — decided in `routes.ts` and only wired by their `+server.ts`.
 */

const viewer: Viewer = { id: 'u-anna', householdId: 'h1' };
const ALBUM = 'a1b0c0d0-0000-4000-8000-000000000001';
const withAlbum = () => {
	const gateway = createFakeImmichGateway({
		...testLibrary(),
		albums: [
			{ id: ALBUM, name: 'Holidays', assetIds: [fakeAssetId(CARL_ID, 0), fakeAssetId(CARL_ID, 3)] }
		]
	});
	return { gateway, deps: { gateway, signer } };
};

const signer = createImmichMediaSigner({
	secret: 'test-secret',
	clock: { now: () => 1_700_000_000_000 }
});

describe('answerLibraryMonths', () => {
	it('answers the timeline’s months as JSON that no cache keeps, and refuses as the library does', async () => {
		const gateway = createFakeImmichGateway(testLibrary());
		const deps = { gateway, signer };
		const answer = await answerLibraryMonths(deps, viewer);
		if (!(answer instanceof Response)) throw new Error(`refused with ${answer.status}`);
		expect(answer.headers.get('cache-control')).toBe(IMMICH_MEDIA_CACHE_CONTROL);
		const body = await answer.json();
		expect([body.state, body.months[0]]).toEqual(['months', { month: '2026-09', count: 4 }]);
		expect(await answerLibraryMonths(deps, null)).toEqual({
			status: 401,
			message: 'errors.notSignedIn'
		});
		expect(await answerLibraryMonths(null, viewer)).toEqual({
			status: 404,
			message: 'errors.notFound'
		});
	});
});

describe('answerLibrary', () => {
	const libraryDeps = () => {
		const gateway = createFakeImmichGateway(testLibrary());
		return { gateway, deps: { gateway, signer } };
	};

	it('answers a day of the library as JSON that no cache keeps', async () => {
		const { deps } = libraryDeps();
		const answer = await answerLibrary(deps, viewer, { day: '2026-09-01', q: null });
		if (!(answer instanceof Response)) throw new Error(`refused with ${answer.status}`);
		expect(answer.headers.get('cache-control')).toBe(IMMICH_MEDIA_CACHE_CONTROL);
		const body = await answer.json();
		expect([body.state, body.photos.length, body.earlier]).toEqual(['day', 4, '2026-08-31']);
	});

	it('answers a page of a month, and a later page from its cursor', async () => {
		const { deps } = libraryDeps();
		const first = await answerLibrary(deps, viewer, { day: null, q: null, month: '2026-08' });
		if (!(first instanceof Response)) throw new Error(`refused with ${first.status}`);
		const page = await first.json();
		expect([page.state, page.month, page.photos.length, page.nextCursor]).toEqual([
			'month',
			'2026-08',
			80,
			null
		]);
		const later = { day: null, q: null, month: '2026-08', cursor: '70' };
		const next = await answerLibrary(deps, viewer, later);
		if (!(next instanceof Response)) throw new Error(`refused with ${next.status}`);
		expect((await next.json()).photos.length).toBeLessThan(80);
	});

	it('answers a page of an album, and a later page from its cursor', async () => {
		const { deps } = withAlbum();
		const answer = await answerLibrary(deps, viewer, { day: null, q: null, album: ALBUM });
		if (!(answer instanceof Response)) throw new Error(`refused with ${answer.status}`);
		const page = await answer.json();
		expect([page.state, page.album, page.photos.length, page.nextCursor]).toEqual([
			'album',
			ALBUM,
			2,
			null
		]);
		const later = await answerLibrary(deps, viewer, {
			day: null,
			q: null,
			album: ALBUM,
			cursor: '1'
		});
		if (!(later instanceof Response)) throw new Error(`refused with ${later.status}`);
		expect((await later.json()).photos.length).toBe(1);
	});

	it('answers a search by description', async () => {
		const { deps } = libraryDeps();
		const answer = await answerLibrary(deps, viewer, { day: null, q: 'Carl' });
		if (!(answer instanceof Response)) throw new Error(`refused with ${answer.status}`);
		expect((await answer.json()).state).toBe('found');
	});

	it('refuses a visitor who is not signed in, an instance without Immich, and a day that is none', async () => {
		const { deps, gateway } = libraryDeps();
		expect(await answerLibrary(deps, null, { day: '2026-09-01', q: null })).toEqual({
			status: 401,
			message: 'errors.notSignedIn'
		});
		expect(await answerLibrary(null, viewer, { day: '2026-09-01', q: null })).toEqual({
			status: 404,
			message: 'errors.notFound'
		});
		for (const query of [
			{ day: '2026-02-30', q: null },
			{ day: '01.09.2026', q: null },
			{ day: null, q: null },
			{ day: '2026-09-01', q: 'both' },
			{ day: null, q: null, month: '2026-13' },
			{ day: null, q: null, month: '2026-9' },
			{ day: '2026-09-01', q: null, month: '2026-09' },
			{ day: '2026-09-01', q: null, cursor: '100' },
			{ day: null, q: null, month: '2026-09', cursor: '' },
			{ day: null, q: null, album: 'holidays' },
			{ day: null, q: null, month: '2026-09', album: ALBUM }
		])
			expect(await answerLibrary(deps, viewer, query)).toEqual({
				status: 404,
				message: 'errors.notFound'
			});
		expect(gateway.calls).toEqual([]);
	});
});

describe('answerLibraryAlbums', () => {
	it('answers the albums as JSON that no cache keeps, and refuses as the library does', async () => {
		const { deps } = withAlbum();
		const answer = await answerLibraryAlbums(deps, viewer);
		if (!(answer instanceof Response)) throw new Error(`refused with ${answer.status}`);
		expect(answer.headers.get('cache-control')).toBe(IMMICH_MEDIA_CACHE_CONTROL);
		const body = await answer.json();
		expect([body.state, body.albums[0].name, body.albums[0].count]).toEqual([
			'albums',
			'Holidays',
			2
		]);
		expect(await answerLibraryAlbums(deps, null)).toEqual({
			status: 401,
			message: 'errors.notSignedIn'
		});
		expect(await answerLibraryAlbums(null, viewer)).toEqual({
			status: 404,
			message: 'errors.notFound'
		});
	});
});
