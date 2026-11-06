import { keptAt } from './cache-policy';

/*
 * The device's storage running out under the kept pages (docs/02 §2.18). Pure: which failure
 * that is, and which kept photos make room. `src/service-worker.ts` does the deleting.
 */

/** One kept response: its key, and the `date` it was kept with. */
export interface KeptEntry {
	key: string;
	date: string | null;
}

/** Whether a cache write failed because the origin's storage quota is spent. */
export function isStorageFull(error: unknown): boolean {
	return error instanceof DOMException && error.name === 'QuotaExceededError';
}

/** How much of the kept photos one eviction gives up: enough to make room for a while. */
const EVICTED_SHARE = 1 / 4;

/**
 * The kept photos to delete so a write fits: the oldest quarter, at least one, unknown age
 * first. Photos only — they are fetched again when seen, while a page is what the device
 * keeps for reading out of reach.
 */
export function mediaToEvict(kept: readonly KeptEntry[], origin: string): string[] {
	const media = kept.filter(({ key }) => {
		const url = new URL(key);
		return url.origin === origin && url.pathname.startsWith('/media/');
	});
	const age = ({ date }: KeptEntry) => keptAt(date) ?? 0;
	const oldestFirst = media.toSorted((a, b) => age(a) - age(b));
	const count = Math.max(1, Math.ceil(media.length * EVICTED_SHARE));
	return oldestFirst.slice(0, count).map(({ key }) => key);
}
