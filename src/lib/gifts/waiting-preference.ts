/*
 * The adapter that remembers, per member on this device, whether the household's list shows the
 * gift ideas still waiting for their time (docs/dev/02 §2.25.8). It reads and writes only through
 * the slice of `Storage` it is handed, so it tests with a map instead of a browser.
 */

/** The part of `localStorage` the preference needs. */
export type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface WaitingPreference {
	load(): boolean;
	save(show: boolean): void;
}

export function waitingPreference(storage: PreferenceStorage, userId: string): WaitingPreference {
	const key = `stella.gifts.showWaiting.${userId}`;
	return {
		load() {
			try {
				return storage.getItem(key) === 'show';
			} catch {
				// Storage can be blocked (private mode, a site setting); they stay hidden.
				return false;
			}
		},
		save(show) {
			try {
				storage.setItem(key, show ? 'show' : 'hide');
			} catch {
				// Not remembered, still applied for this visit.
			}
		}
	};
}
