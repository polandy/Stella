import { isWholeDay } from '../../../dates/calendar';
import {
	IMMICH_MEMORY_PAGE,
	type ImmichMemories,
	type ImmichMemoryPage,
	type ImmichMemoryPhoto
} from '../../../immich/on-this-day';
import { immichPhotoUrl } from '../../../immich/web-link';
import { memoryDaysFor } from '../../../memories/memories';
import type { Viewer } from '../../access/visibility';
import { cameraDayOf, cameraDaysWindow } from '../immich/camera-day';
import type { ImmichAsset, ImmichGateway } from '../immich/gateway';
import { LIBRARY_DAY_LIMIT, signLibraryPhotos } from '../immich/library';
import type { ImmichMediaSigner } from '../immich/signed-media';

/*
 * *On this day* from Immich (docs/02 §2.12.1): any photo of the timeline taken on the day's day
 * and month in an earlier year, whoever is in it — the library is open to the household, as the
 * picker beside an upload has it (§2.24.9), so each photo is signed for the viewer's household.
 * Read apart from `memoriesOn`, after the page is drawn, so Home never waits on Immich.
 */

export interface ImmichMemoryDeps {
	gateway: Pick<ImmichGateway, 'takenAssets'>;
	signer: ImmichMediaSigner;
	publicUrl: string;
}

type YearRead = { ok: true; assets: ImmichAsset[] } | { ok: false };

/**
 * Every earlier year with a photo taken on `day`'s day and month (`YYYY-MM-DD`, the household's
 * today or a picked one), newest year first, back to the oldest photo of the timeline: one call
 * for that photo, then one for each year, all at once.
 */
export async function immichMemoriesOn(
	deps: ImmichMemoryDeps,
	viewer: Viewer,
	day: string
): Promise<ImmichMemories> {
	const oldest = await deps.gateway.takenAssets({ from: null, before: null }, 'oldest', 1, null);
	if (!oldest.ok) return { state: 'unreachable' };
	const oldestDay = oldest.value.assets.map(cameraDayOf).at(0);
	if (!oldestDay) return { state: 'years', years: [] };

	const years: number[] = [];
	for (let year = yearOf(day) - 1; year >= yearOf(oldestDay); year--) years.push(year);
	const reads = await Promise.all(years.map((year) => readYear(deps, day, year)));
	const found: { year: number; assets: ImmichAsset[] }[] = [];
	for (const [at, read] of reads.entries()) {
		if (!read.ok) return { state: 'unreachable' };
		if (read.assets.length > 0) found.push({ year: years[at], assets: read.assets });
	}
	return {
		state: 'years',
		years: await Promise.all(
			found.map(async ({ year, assets }) => ({
				year,
				photos: await signed(deps, viewer, year, assets.slice(0, IMMICH_MEMORY_PAGE)),
				total: assets.length
			}))
		)
	};
}

/** A further page of one earlier year, from the `from`-th photo on — for *Show more*. */
export async function immichMemoryPage(
	deps: ImmichMemoryDeps,
	viewer: Viewer,
	day: string,
	year: number,
	from: number
): Promise<ImmichMemoryPage> {
	if (year >= yearOf(day)) return { state: 'photos', photos: [] };
	const read = await readYear(deps, day, year);
	if (!read.ok) return { state: 'unreachable' };
	const page = read.assets.slice(from, from + IMMICH_MEMORY_PAGE);
	return { state: 'photos', photos: await signed(deps, viewer, year, page) };
}

const yearOf = (day: string): number => Number(day.slice(0, 4));

/**
 * The photos `year` took on the days `day` remembers, the latest first. 28 February of a common
 * year also remembers the 29th (`memoryDaysFor`), which only a leap year has to ask about.
 */
async function readYear(deps: ImmichMemoryDeps, day: string, year: number): Promise<YearRead> {
	const days = memoryDaysFor(day)
		.map((monthDay) => `${year}-${monthDay}`)
		.filter(isWholeDay);
	if (days.length === 0) return { ok: true, assets: [] };
	const listed = await deps.gateway.takenAssets(
		cameraDaysWindow(days[0], days[days.length - 1]),
		'newest',
		LIBRARY_DAY_LIMIT,
		null
	);
	if (!listed.ok) return { ok: false };
	const assets = listed.value.assets
		.filter((asset) => days.includes(cameraDayOf(asset) ?? ''))
		.toSorted((a, b) => (b.takenAt ?? '').localeCompare(a.takenAt ?? ''));
	return { ok: true, assets };
}

async function signed(
	deps: ImmichMemoryDeps,
	viewer: Viewer,
	year: number,
	assets: readonly ImmichAsset[]
): Promise<ImmichMemoryPhoto[]> {
	const photos = await signLibraryPhotos(deps.signer, viewer, assets);
	return photos.map((photo) => ({
		...photo,
		year,
		openUrl: immichPhotoUrl(deps.publicUrl, photo.id)
	}));
}
