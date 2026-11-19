import { describe, expect, it } from 'bun:test';
import {
	BERT_AND_CARL_ID,
	BERT_ID,
	CARL_ID,
	DORA_ID,
	testLibrary
} from '../domain/immich/test-library';
import { createFakeImmichGateway, fakeAssetId } from './fake-gateway';
import { demoImmichLibrary } from './demo-library';

/*
 * The in-memory Immich behind the use-case tests and the demo (docs/dev/02 §2.24.5): what
 * it lists for one person and for people together decides what the together-view can show.
 */

const ids = (
	outcome: Awaited<ReturnType<ReturnType<typeof createFakeImmichGateway>['latestAssets']>>
) => (outcome.ok ? outcome.value.assets.map((asset) => asset.id) : outcome.failure);

describe('createFakeImmichGateway latestAssets', () => {
	it('lists one person’s own photos, never the ones they share', async () => {
		const gateway = createFakeImmichGateway(testLibrary());
		const page = await gateway.latestAssets({ personIds: [CARL_ID], match: 'any' }, 50, null);
		expect(ids(page)).toEqual(Array.from({ length: 7 }, (_, index) => fakeAssetId(CARL_ID, index)));
	});

	it('lists the photos two people are in together, a page at a time', async () => {
		const gateway = createFakeImmichGateway(testLibrary());
		const first = await gateway.latestAssets(
			{ personIds: [BERT_ID, CARL_ID], match: 'all' },
			12,
			null
		);
		expect(ids(first)).toEqual(
			Array.from({ length: 12 }, (_, index) => fakeAssetId(BERT_AND_CARL_ID, index))
		);
		if (!first.ok || first.value.nextCursor === null) throw new Error('no second page');
		const second = await gateway.latestAssets(
			{ personIds: [CARL_ID, BERT_ID], match: 'all' },
			12,
			first.value.nextCursor
		);
		expect(ids(second)).toHaveLength(3);
		expect(second.ok && second.value.nextCursor).toBeNull();
	});

	it('lists nothing for two people who share no photo, and nobody unknown', async () => {
		const gateway = createFakeImmichGateway(testLibrary());
		expect(
			ids(await gateway.latestAssets({ personIds: [BERT_ID, DORA_ID], match: 'all' }, 12, null))
		).toEqual([]);
		const unknown = '0f000000-0000-4000-8000-000000000000';
		expect(
			await gateway.latestAssets({ personIds: [BERT_ID, unknown], match: 'all' }, 12, null)
		).toEqual({
			ok: false,
			failure: 'notFound'
		});
	});

	it('draws a shared photo like any other', async () => {
		const gateway = createFakeImmichGateway(testLibrary());
		const image = await gateway.assetImage(fakeAssetId(BERT_AND_CARL_ID, 0), 'thumbnail');
		expect(image.ok && image.value.contentType).toBe('image/png');
	});

	it('gives the demo’s couple photos together, so the together-view has something to show', async () => {
		const library = demoImmichLibrary();
		const [markus, sandra] = library.people;
		const gateway = createFakeImmichGateway(library);
		const page = await gateway.latestAssets(
			{ personIds: [markus.id, sandra.id], match: 'all' },
			12,
			null
		);
		const couple = library.together?.find(
			(group) => group.personIds.length === 2 && group.personIds.includes(sandra.id)
		);
		if (!couple) throw new Error('the demo has no couple photos');
		expect(ids(page)).toContain(fakeAssetId(couple.id, 0));
		// No shared photo's id is a face's photo id.
		const faceSuffixes = new Set(library.people.map((person) => person.id.slice(8)));
		for (const group of library.together ?? [])
			expect(faceSuffixes.has(group.id.slice(8))).toBe(false);
	});
});

describe('createFakeImmichGateway takenAssets', () => {
	const window = (from: string | null, before: string | null) => ({ from, before });

	it('lists everyone’s photos of a window, a person’s and the shared ones, by the camera’s clock', async () => {
		const gateway = createFakeImmichGateway(testLibrary());
		// The newest photo of every source was taken on 1 September, the next one a day before.
		const page = await gateway.takenAssets(
			window('2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z'),
			'oldest',
			50,
			null
		);
		expect(ids(page)).toEqual(
			[BERT_ID, CARL_ID, DORA_ID, BERT_AND_CARL_ID].map((id) => fakeAssetId(id, 0)).sort()
		);
		expect(page.ok && page.value.assets[0].takenAt).toBe('2026-09-01T15:30:00');
	});

	it('pages newest first through an open window', async () => {
		const gateway = createFakeImmichGateway(testLibrary());
		const first = await gateway.takenAssets(
			window(null, '2026-08-31T00:00:00.000Z'),
			'newest',
			3,
			null
		);
		const days = (outcome: typeof first) =>
			outcome.ok ? outcome.value.assets.map((asset) => asset.takenAt?.slice(0, 10)) : [];
		expect(days(first)).toEqual(['2026-08-30', '2026-08-30', '2026-08-30']);
		if (!first.ok || first.value.nextCursor === null) throw new Error('no second page');
		const second = await gateway.takenAssets(
			window(null, '2026-08-31T00:00:00.000Z'),
			'newest',
			3,
			first.value.nextCursor
		);
		expect(days(second)[0]).toBe('2026-08-30');
	});
});

describe('createFakeImmichGateway smartSearch', () => {
	it('finds the photos of a person a word of the query names, newest first', async () => {
		const gateway = createFakeImmichGateway(testLibrary());
		const found = await gateway.smartSearch('carl at the lake', 60);
		expect(found.ok && found.value.enabled && found.value.assets.map((asset) => asset.id)).toEqual(
			Array.from({ length: 7 }, (_, index) => fakeAssetId(CARL_ID, index))
		);
	});

	it('finds nothing for a description that names nobody, and says when smart search is off', async () => {
		const gateway = createFakeImmichGateway(testLibrary());
		expect(await gateway.smartSearch('sunset', 60)).toEqual({
			ok: true,
			value: { enabled: true, assets: [] }
		});
		gateway.library.smartSearch = false;
		expect(await gateway.smartSearch('carl', 60)).toEqual({ ok: true, value: { enabled: false } });
	});
});

describe('createFakeImmichGateway timelineMonths', () => {
	it('counts everyone’s photos per month of the camera’s clock, newest month first', async () => {
		const outcome = await createFakeImmichGateway(testLibrary()).timelineMonths();
		if (!outcome.ok) throw new Error(outcome.failure);
		// 1 September: one photo of each source; August: Bert 31, Carl 6, Dora 29, together 14.
		expect(outcome.value.slice(0, 2)).toEqual([
			{ month: '2026-09', count: 4 },
			{ month: '2026-08', count: 80 }
		]);
		const total = outcome.value.reduce((sum, { count }) => sum + count, 0);
		expect(total).toBe(1284 + 7 + 30 + 15);
	});

	it('gives the demo library years of months to browse', async () => {
		const outcome = await createFakeImmichGateway(demoImmichLibrary()).timelineMonths();
		if (!outcome.ok) throw new Error(outcome.failure);
		const years = new Set(outcome.value.map(({ month }) => month.slice(0, 4)));
		expect(years.size).toBeGreaterThan(5);
	});
});

describe('createFakeImmichGateway albums', () => {
	const ALBUM = 'a1b0c0d0-0000-4000-8000-000000000001';
	const EMPTY = 'a1b0c0d0-0000-4000-8000-000000000002';
	const MISSING = fakeAssetId(CARL_ID, 99);
	const withAlbums = () =>
		createFakeImmichGateway({
			...testLibrary(),
			albums: [
				{
					id: ALBUM,
					name: 'Holidays',
					assetIds: [fakeAssetId(CARL_ID, 0), fakeAssetId(CARL_ID, 3)]
				},
				{ id: EMPTY, name: 'Empty', assetIds: [], coverAssetId: MISSING }
			]
		});

	it('lists each album with its count, cover and the days of its first and last photo', async () => {
		expect(await withAlbums().albums()).toEqual({
			ok: true,
			value: [
				{
					id: ALBUM,
					name: 'Holidays',
					count: 2,
					coverAssetId: fakeAssetId(CARL_ID, 0),
					from: '2026-08-29',
					to: '2026-09-01'
				},
				{ id: EMPTY, name: 'Empty', count: 0, coverAssetId: MISSING, from: null, to: null }
			]
		});
	});

	it('pages an album oldest first, and an unknown one is not found', async () => {
		const gateway = withAlbums();
		const first = await gateway.albumAssets(ALBUM, 1, null);
		expect(first).toEqual({
			ok: true,
			value: {
				assets: [{ id: fakeAssetId(CARL_ID, 3), takenAt: '2026-08-29T15:30:00' }],
				nextCursor: '1'
			}
		});
		const second = await gateway.albumAssets(ALBUM, 1, '1');
		expect(second.ok && second.value).toEqual({
			assets: [{ id: fakeAssetId(CARL_ID, 0), takenAt: '2026-09-01T15:30:00' }],
			nextCursor: null
		});
		expect(await gateway.albumAssets(EMPTY.replace('2', '9'), 1, null)).toEqual({
			ok: false,
			failure: 'notFound'
		});
	});

	it('finds a photo of the library by id, and nothing for an id it does not hold', async () => {
		const gateway = withAlbums();
		expect(await gateway.timelinePhoto(fakeAssetId(CARL_ID, 3))).toEqual({
			ok: true,
			value: { id: fakeAssetId(CARL_ID, 3), takenAt: '2026-08-29T15:30:00' }
		});
		expect(await gateway.timelinePhoto(MISSING)).toEqual({ ok: false, failure: 'notFound' });
	});

	it('gives the demo enough albums for the name filter', async () => {
		const listed = await createFakeImmichGateway(demoImmichLibrary()).albums();
		expect(listed.ok && listed.value.length).toBeGreaterThanOrEqual(12);
	});
});
