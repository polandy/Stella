import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import type { ImmichGateway } from '../immich/gateway';
import { createImmichMediaSigner } from '../immich/signed-media';
import { libraryOf } from '../immich/test-library';
import { fixedClock } from '../testing';
import { immichMemoriesOn, immichMemoryPage, type ImmichMemoryDeps } from './immich';

/*
 * *On this day* from Immich (docs/02 §2.12.1): any photo of the timeline taken on the day's day
 * and month in an earlier year, back to the oldest photo, a year at a time — each signed for the
 * viewer's household, as the library picker's are.
 */

const viewer: Viewer = { id: 'u-anna', householdId: 'h1' };
const PUBLIC_URL = 'https://immich.example.test';

type TakenAssets = Pick<ImmichGateway, 'takenAssets'>;

/** The deps over `gateway`, and every window it was asked for, in order. */
function setup(gateway: TakenAssets) {
	const signer = createImmichMediaSigner({
		secret: 'test-secret',
		clock: fixedClock(1_700_000_000_000)
	});
	const asked: Parameters<ImmichGateway['takenAssets']>[] = [];
	const counted: TakenAssets = {
		takenAssets: (...args) => {
			asked.push(args);
			return gateway.takenAssets(...args);
		}
	};
	const deps: ImmichMemoryDeps = { gateway: counted, signer, publicUrl: PUBLIC_URL };
	return { deps, signer, asked };
}

/** What a signed media URL's token was signed for. */
async function signedFor(signer: ImmichMemoryDeps['signer'], url: string) {
	const verified = await signer.verify(url.split('/').at(-1) ?? '');
	if (!verified.ok) throw new Error('not a signed URL');
	const { expiresAt: _, ...media } = verified.media;
	return media;
}

const A = '0a000000-0000-4000-8000-000000000000';
const asset = (n: number) => `${n.toString(16).padStart(8, '0')}${A.slice(8)}`;

/** The years and their photos' ids, as a test reads them. */
async function yearsOf(deps: ImmichMemoryDeps, day: string) {
	const memories = await immichMemoriesOn(deps, viewer, day);
	if (memories.state !== 'years') throw new Error(memories.state);
	return memories.years.map(({ year, photos, total }) => ({
		year,
		ids: photos.map((photo) => photo.id),
		total
	}));
}

describe('immichMemoriesOn', () => {
	it('lists each earlier year’s photos of the day, newest year first, the latest photo first', async () => {
		const { deps } = setup(
			libraryOf({
				[asset(1)]: '2019-11-02T08:00:00',
				[asset(2)]: '2022-11-02T09:00:00',
				[asset(3)]: '2022-11-02T18:30:00',
				[asset(4)]: '2022-11-03T10:00:00',
				[asset(5)]: '2024-11-02T12:00:00',
				// Today's photo is not a memory yet.
				[asset(6)]: '2026-11-02T07:00:00'
			})
		);
		expect(await yearsOf(deps, '2026-11-02')).toEqual([
			{ year: 2024, ids: [asset(5)], total: 1 },
			{ year: 2022, ids: [asset(3), asset(2)], total: 2 },
			{ year: 2019, ids: [asset(1)], total: 1 }
		]);
	});

	it('signs each photo for the household, the preview with its date, and links it into Immich', async () => {
		const { deps, signer } = setup(libraryOf({ [asset(1)]: '2024-11-02T12:00:00' }));
		const memories = await immichMemoriesOn(deps, viewer, '2026-11-02');
		if (memories.state !== 'years') throw new Error(memories.state);
		const [photo] = memories.years[0].photos;
		expect([photo.year, photo.takenAt]).toEqual([2024, '2024-11-02T12:00:00']);
		expect(photo.openUrl).toBe(`${PUBLIC_URL}/photos/${asset(1)}`);
		expect(await signedFor(signer, photo.thumbnailUrl)).toEqual({
			kind: 'library',
			householdId: 'h1',
			assetId: asset(1),
			size: 'thumbnail'
		});
		expect(await signedFor(signer, photo.previewUrl)).toEqual({
			kind: 'library',
			householdId: 'h1',
			assetId: asset(1),
			size: 'preview',
			takenAt: '2024-11-02T12:00:00'
		});
	});

	it('reads the day on the camera’s clock, not on UTC’s', async () => {
		const { deps } = setup(
			libraryOf({
				[asset(1)]: '2024-11-01T23:50:00',
				[asset(2)]: '2024-11-02T00:10:00',
				[asset(3)]: '2024-11-02T23:50:00',
				[asset(4)]: '2024-11-03T00:10:00'
			})
		);
		expect(await yearsOf(deps, '2026-11-02')).toEqual([
			{ year: 2024, ids: [asset(3), asset(2)], total: 2 }
		]);
	});

	it('looks back to the oldest photo: asks for it once, then once for each year since', async () => {
		const { deps, asked } = setup(
			libraryOf({ [asset(1)]: '2021-03-15T10:00:00', [asset(2)]: '2025-06-01T10:00:00' })
		);
		expect(await yearsOf(deps, '2026-11-02')).toEqual([]);
		expect(asked[0]).toEqual([{ from: null, before: null }, 'oldest', 1, null]);
		// 2025 back to 2021, each a window around its day.
		expect(asked.slice(1).map(([window]) => window.from?.slice(0, 4))).toEqual(
			expect.arrayContaining(['2025', '2024', '2023', '2022', '2021'])
		);
		expect(asked).toHaveLength(6);
	});

	it('asks nothing more of an empty library', async () => {
		const { deps, asked } = setup(libraryOf({}));
		expect(await yearsOf(deps, '2026-11-02')).toEqual([]);
		expect(asked).toHaveLength(1);
	});

	it('shows a year’s first page and counts all of its photos', async () => {
		const taken: Record<string, string> = {};
		for (let n = 0; n < 30; n++) taken[asset(n)] = `2024-11-02T10:${String(n).padStart(2, '0')}:00`;
		const { deps } = setup(libraryOf(taken));
		const [year] = await yearsOf(deps, '2026-11-02');
		expect(year.total).toBe(30);
		expect(year.ids).toEqual(Array.from({ length: 12 }, (_, i) => asset(29 - i)));
	});

	it('remembers 29 February on the 28th of a common year', async () => {
		const { deps } = setup(
			libraryOf({
				[asset(1)]: '2024-02-28T10:00:00',
				[asset(2)]: '2024-02-29T10:00:00',
				[asset(3)]: '2023-02-28T10:00:00',
				[asset(4)]: '2024-03-01T10:00:00'
			})
		);
		expect(await yearsOf(deps, '2027-02-28')).toEqual([
			{ year: 2024, ids: [asset(2), asset(1)], total: 2 },
			{ year: 2023, ids: [asset(3)], total: 1 }
		]);
	});

	it('remembers 29 February in a leap year only from the leap years before it', async () => {
		const { deps, asked } = setup(
			libraryOf({
				[asset(1)]: '2024-02-29T10:00:00',
				[asset(2)]: '2025-02-28T10:00:00',
				[asset(3)]: '2020-02-29T10:00:00'
			})
		);
		expect(await yearsOf(deps, '2028-02-29')).toEqual([
			{ year: 2024, ids: [asset(1)], total: 1 },
			{ year: 2020, ids: [asset(3)], total: 1 }
		]);
		// The oldest photo, then 2024 and 2020: a common year has no such day to ask about.
		expect(asked).toHaveLength(3);
	});

	it('reads as unreachable when Immich does not answer, for the oldest photo or for a year', async () => {
		const failing: TakenAssets = {
			takenAssets: async () => ({ ok: false, failure: 'unreachable' })
		};
		expect(await immichMemoriesOn(setup(failing).deps, viewer, '2026-11-02')).toEqual({
			state: 'unreachable'
		});

		const library = libraryOf({ [asset(1)]: '2020-11-02T10:00:00' });
		const failsForYears: TakenAssets = {
			takenAssets: (window, ...rest) =>
				window.from === null
					? library.takenAssets(window, ...rest)
					: Promise.resolve({ ok: false, failure: 'unreachable' })
		};
		expect(await immichMemoriesOn(setup(failsForYears).deps, viewer, '2026-11-02')).toEqual({
			state: 'unreachable'
		});
	});
});

describe('immichMemoryPage', () => {
	const taken: Record<string, string> = {};
	for (let n = 0; n < 30; n++) taken[asset(n)] = `2024-11-02T10:${String(n).padStart(2, '0')}:00`;

	it('gives the next photos of one year, from where the shown ones end', async () => {
		const { deps } = setup(libraryOf(taken));
		const page = await immichMemoryPage(deps, viewer, '2026-11-02', 2024, 24);
		expect(page.state === 'photos' && page.photos.map((photo) => photo.id)).toEqual(
			Array.from({ length: 6 }, (_, i) => asset(5 - i))
		);
	});

	it('has nothing for this year or a later one, and asks Immich nothing', async () => {
		const { deps, asked } = setup(libraryOf(taken));
		expect(await immichMemoryPage(deps, viewer, '2024-11-02', 2024, 0)).toEqual({
			state: 'photos',
			photos: []
		});
		expect(asked).toHaveLength(0);
	});

	it('reads as unreachable when Immich does not answer', async () => {
		const { deps } = setup({
			takenAssets: async () => ({ ok: false, failure: 'unreachable' })
		});
		expect(await immichMemoryPage(deps, viewer, '2026-11-02', 2024, 12)).toEqual({
			state: 'unreachable'
		});
	});
});
