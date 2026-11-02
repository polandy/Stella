import type { ImmichAsset, ImmichTakenWindow } from './gateway';

/*
 * Days on the camera's clock (docs/02 §2.24.9). Immich filters on the instant a photo was taken,
 * not on the clock it was taken by, so a day on that clock is asked for wider and each photo's
 * `takenAt` read back.
 */

/**
 * How far an instant may lie from the camera's clock: the widest offsets (UTC−12, UTC+14). Immich
 * filters on the instant, so a day on the clock is asked for this much wider on each side.
 */
export const MAX_OFFSET_MS = 14 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

const instant = (ms: number) => new Date(ms).toISOString();

/** The instants any photo taken from `first` to `last` (`YYYY-MM-DD`, both included) lies within. */
export function cameraDaysWindow(first: string, last: string): ImmichTakenWindow {
	return {
		from: instant(Date.parse(`${first}T00:00:00Z`) - MAX_OFFSET_MS),
		before: instant(Date.parse(`${last}T00:00:00Z`) + DAY_MS + MAX_OFFSET_MS)
	};
}

/** The day a photo was taken on the camera's clock, or null when Immich does not say. */
export const cameraDayOf = (asset: ImmichAsset): string | null =>
	asset.takenAt?.slice(0, 10) ?? null;
