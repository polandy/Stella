import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import { createFakeImmichGateway, fakeAssetId } from '../../immich/fake-gateway';
import type { ImmichAsset, ImmichGateway } from './gateway';
import {
	libraryCopyTakenAt,
	readLibraryDay,
	searchLibrary,
	type ImmichLibraryDeps
} from './library';
import { createImmichMediaSigner } from './signed-media';
import { BERT_AND_CARL_ID, BERT_ID, CARL_ID, DORA_ID, testLibrary } from './test-library';
import { fixedClock } from '../testing';

/*
 * The whole library, for the picker beside a photo upload (docs/02 §2.24.9): a day on the
 * camera's clock with its nearest neighbours, and a search by description. Every photo is
 * signed for the viewer's household, whoever is in it.
 */

const viewer: Viewer = { id: 'u-anna', householdId: 'h1' };

function setup(
	gateway: Pick<ImmichGateway, 'takenAssets' | 'smartSearch'> = createFakeImmichGateway(
		testLibrary()
	)
) {
	const signer = createImmichMediaSigner({
		secret: 'test-secret',
		clock: fixedClock(1_700_000_000_000)
	});
	const deps: ImmichLibraryDeps = { gateway, signer };
	return { deps, signer };
}

/** What a signed media URL's token was signed for. */
async function signedFor(signer: ImmichLibraryDeps['signer'], url: string) {
	const verified = await signer.verify(url.split('/').at(-1) ?? '');
	if (!verified.ok) throw new Error('not a signed URL');
	const { expiresAt: _, ...media } = verified.media;
	return media;
}

/** A gateway whose whole library is these photos, each taken at its camera-clock time. */
function libraryOf(
	taken: Record<string, string>
): Pick<ImmichGateway, 'takenAssets' | 'smartSearch'> {
	// Each photo's instant: the clock time at UTC−10, so the day's window must reach past midnight.
	const listed: (ImmichAsset & { instant: string })[] = Object.entries(taken)
		.map(([id, takenAt]) => ({
			id,
			takenAt,
			instant: new Date(Date.parse(`${takenAt}Z`) + 10 * 3_600_000).toISOString()
		}))
		.sort((a, b) => a.takenAt.localeCompare(b.takenAt));
	return {
		takenAssets: async ({ from, before }, order, limit, cursor) => {
			const within = listed.filter(
				({ instant }) => (from === null || instant >= from) && (before === null || instant < before)
			);
			if (order === 'newest') within.reverse();
			const start = cursor === null ? 0 : Number(cursor);
			const page = within.slice(start, start + limit);
			return {
				ok: true,
				value: {
					assets: page.map(({ id, takenAt }) => ({ id, takenAt })),
					nextCursor: start + limit < within.length ? String(start + limit) : null
				}
			};
		},
		smartSearch: async () => ({ ok: true, value: { enabled: false } })
	};
}

const A = '0a000000-0000-4000-8000-000000000000';
const asset = (n: number) => `${n.toString(16).padStart(8, '0')}${A.slice(8)}`;

describe('readLibraryDay', () => {
	it('lists everyone’s photos of the day, oldest first, each signed for the household', async () => {
		const { deps, signer } = setup();
		const view = await readLibraryDay(deps, viewer, '2026-09-01');
		if (view.state !== 'day') throw new Error(view.state);
		expect(view.photos.map((photo) => photo.id)).toEqual(
			[BERT_ID, CARL_ID, DORA_ID, BERT_AND_CARL_ID].map((id) => fakeAssetId(id, 0)).sort()
		);
		const [first] = view.photos;
		expect(first.takenAt).toBe('2026-09-01T15:30:00');
		expect(await signedFor(signer, first.thumbnailUrl)).toEqual({
			kind: 'library',
			householdId: 'h1',
			assetId: first.id,
			size: 'thumbnail'
		});
		// The preview carries the date a gallery copy keeps.
		expect(await signedFor(signer, first.previewUrl)).toEqual({
			kind: 'library',
			householdId: 'h1',
			assetId: first.id,
			size: 'preview',
			takenAt: '2026-09-01T15:30:00'
		});
	});

	it('reads the day on the camera’s clock, not on UTC’s', async () => {
		const { deps } = setup(
			libraryOf({
				[asset(1)]: '2026-08-13T23:50:00',
				[asset(2)]: '2026-08-14T00:10:00',
				[asset(3)]: '2026-08-14T23:50:00',
				[asset(4)]: '2026-08-15T00:10:00'
			})
		);
		const view = await readLibraryDay(deps, viewer, '2026-08-14');
		expect(view.state === 'day' && view.photos.map((photo) => photo.id)).toEqual([
			asset(2),
			asset(3)
		]);
	});

	it('names the nearest earlier and later day that has photos, past many of the day itself', async () => {
		const taken: Record<string, string> = {
			[asset(1)]: '2026-07-02T09:00:00',
			[asset(2)]: '2026-08-01T22:00:00',
			[asset(500)]: '2026-08-20T08:00:00',
			[asset(501)]: '2026-09-30T12:00:00'
		};
		// A busy night, in both ends of the neighbours' windows: more photos than one page of them.
		const twoDigits = (n: number) => String(n).padStart(2, '0');
		for (let n = 10; n < 260; n++)
			taken[asset(n)] = `2026-08-14T00:${twoDigits(n % 60)}:${twoDigits(Math.floor(n / 60))}`;
		const { deps } = setup(libraryOf(taken));
		const view = await readLibraryDay(deps, viewer, '2026-08-14');
		expect(view.state === 'day' && [view.earlier, view.later]).toEqual([
			'2026-08-01',
			'2026-08-20'
		]);
		const empty = await readLibraryDay(deps, viewer, '2026-08-05');
		expect(empty.state === 'day' && [empty.photos, empty.earlier, empty.later]).toEqual([
			[],
			'2026-08-01',
			'2026-08-14'
		]);
	});

	it('names no neighbour past the first or the last day', async () => {
		const { deps } = setup(libraryOf({ [asset(1)]: '2026-08-14T10:00:00' }));
		const view = await readLibraryDay(deps, viewer, '2026-08-14');
		expect(view.state === 'day' && [view.earlier, view.later]).toEqual([null, null]);
	});

	it('says Immich did not answer, whatever the reason', async () => {
		const gateway = createFakeImmichGateway(testLibrary());
		gateway.failing = { takenAssets: 'forbidden' };
		const { deps } = setup(gateway);
		expect(await readLibraryDay(deps, viewer, '2026-09-01')).toEqual({ state: 'unreachable' });
	});
});

describe('searchLibrary', () => {
	it('finds photos by description, best match first, each signed for the household', async () => {
		const { deps, signer } = setup();
		const view = await searchLibrary(deps, viewer, '  carl at the lake ');
		if (view.state !== 'found') throw new Error(view.state);
		expect(view.photos.map((photo) => photo.id)).toEqual(
			Array.from({ length: 7 }, (_, index) => fakeAssetId(CARL_ID, index))
		);
		expect((await signedFor(signer, view.photos[0].previewUrl)).kind).toBe('library');
	});

	it('says when the library has no smart search, and when Immich did not answer', async () => {
		const gateway = createFakeImmichGateway(testLibrary());
		const { deps } = setup(gateway);
		gateway.library.smartSearch = false;
		expect(await searchLibrary(deps, viewer, 'carl')).toEqual({ state: 'searchOff' });
		gateway.failing = { smartSearch: 'unreachable' };
		expect(await searchLibrary(deps, viewer, 'carl')).toEqual({ state: 'unreachable' });
	});

	it('finds nothing for an empty query without asking Immich', async () => {
		const gateway = createFakeImmichGateway(testLibrary());
		const { deps } = setup(gateway);
		expect(await searchLibrary(deps, viewer, '   ')).toEqual({ state: 'found', photos: [] });
		expect(gateway.calls).toEqual([]);
	});
});

describe('libraryCopyTakenAt', () => {
	const preview = {
		kind: 'library',
		householdId: 'h1',
		assetId: fakeAssetId(BERT_ID, 0),
		size: 'preview',
		takenAt: '2026-09-01T15:30:00'
	} as const;

	it('dates a copy by what Immich said, from the preview it was made from', async () => {
		const { signer } = setup();
		expect(await libraryCopyTakenAt(signer, viewer, await signer.sign(preview))).toBe(
			'2026-09-01T15:30:00'
		);
	});

	it('dates nothing by a token of another household, a thumbnail, another kind or no token at all', async () => {
		const { signer } = setup();
		const { takenAt: _, ...undated } = preview;
		for (const token of [
			await signer.sign({ ...preview, householdId: 'h2' }),
			await signer.sign({ ...preview, size: 'thumbnail' }),
			await signer.sign(undated),
			await signer.sign({ kind: 'face', contactId: 'c-bert', personId: BERT_ID }),
			'x.y'
		])
			expect(await libraryCopyTakenAt(signer, viewer, token)).toBeNull();
	});
});
