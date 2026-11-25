import type { PreferenceStorage } from '#lib/gifts/waiting-preference.js';

/*
 * The adapter that remembers, on this browser, whether circles show members *Then* or *Now*
 * (docs/dev/02 §2.4.2). Only an explicit choice is stored; until then each circle opens on its
 * own default. It reads and writes only through the storage slice it is handed.
 */

export type ThenOrNow = 'then' | 'now';

const KEY = 'stella.circles.photos';

export interface ThenPreference {
	/** The reader's choice, null before they made one. */
	load(): ThenOrNow | null;
	save(choice: ThenOrNow): void;
}

export function thenPreference(storage: PreferenceStorage): ThenPreference {
	return {
		load() {
			try {
				const stored = storage.getItem(KEY);
				return stored === 'then' || stored === 'now' ? stored : null;
			} catch {
				// Storage can be blocked (private mode, a site setting); each circle's default holds.
				return null;
			}
		},
		save(choice) {
			try {
				storage.setItem(KEY, choice);
			} catch {
				// Not remembered, still applied for this visit.
			}
		}
	};
}

/** What a circle shows: the reader's choice, else *Then* for an ended circle. */
export function showsThen(choice: ThenOrNow | null, startsOnThen: boolean): boolean {
	return choice === null ? startsOnThen : choice === 'then';
}
