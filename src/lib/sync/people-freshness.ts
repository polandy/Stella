/*
 * The app shell sends the people the viewer may see once, and every picker reads that list
 * rather than a copy in each page's data (docs/04 §4.9). A client-side navigation does not
 * reload the shell, so after one the stamp of what the server would send now is asked for —
 * a few bytes — and the list is reloaded only when it differs: someone added, renamed,
 * archived or made private in the meantime, by anyone in the household.
 */

export interface PeopleFreshnessDeps {
	/** The stamp of the list the server would send now. */
	fetchStamp(): Promise<string>;
	/** Reload the shell's list. */
	reload(): Promise<void>;
}

/** What the check found: a stale list reloaded, a current one, or no answer to compare. */
export type Freshness = 'reloaded' | 'fresh' | 'unknown';

/** Reload the shell's list when it no longer matches `known`, the stamp it was sent with. */
export async function refreshPeopleIfChanged(
	deps: PeopleFreshnessDeps,
	known: string
): Promise<Freshness> {
	let current: string;
	try {
		current = await deps.fetchStamp();
	} catch {
		// Out of reach: the list on the device is the best there is, and offline reading says so.
		return 'unknown';
	}
	if (current === known) return 'fresh';
	await deps.reload();
	return 'reloaded';
}

/**
 * Whether the shell's own data was reloaded since the last look — then the list is as fresh
 * as a stamp could make it, and asking would cost a request to learn nothing. Told apart by
 * identity: a reload hands the layout a new list, a kept shell the same one.
 */
export function shellReloads(initial: unknown) {
	let lastSeen = initial;
	return {
		reloadedSinceLastLook(current: unknown): boolean {
			const reloaded = current !== lastSeen;
			lastSeen = current;
			return reloaded;
		}
	};
}
