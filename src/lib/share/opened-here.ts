import { noteViewed } from './recent';

/*
 * The adapter that keeps, per member and device, who was opened last (docs/02 §2.18.3): the
 * people the share sheet offers first. What the list means is `recent.ts`; this only reads and
 * writes it, through the slice of `Storage` it is handed, so it tests with a map. A device
 * preference, not a record — lost with the browser's storage, and nothing breaks.
 */

/** The part of `localStorage` the list needs. */
export type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface OpenedHere {
	load(): string[];
	note(contactId: string): void;
}

export function openedHere(storage: PreferenceStorage, memberId: string): OpenedHere {
	const key = `stella.opened.${memberId}`;
	function load(): string[] {
		try {
			const stored: unknown = JSON.parse(storage.getItem(key) ?? '[]');
			return Array.isArray(stored) ? stored.filter((id) => typeof id === 'string') : [];
		} catch {
			// Blocked or unreadable storage: the sheet falls back on the last touched.
			return [];
		}
	}
	return {
		load,
		note(contactId) {
			try {
				storage.setItem(key, JSON.stringify(noteViewed(load(), contactId)));
			} catch {
				// Not remembered; the sheet still offers the last touched.
			}
		}
	};
}

/**
 * The browser's `localStorage`, reached only when asked: touching it at all can throw where
 * site data is blocked, and that has to land inside the guards above.
 */
export const deviceStorage: PreferenceStorage = {
	getItem: (key) => localStorage.getItem(key),
	setItem: (key, value) => localStorage.setItem(key, value)
};
