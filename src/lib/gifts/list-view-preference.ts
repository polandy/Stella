/*
 * Which way the household's list is read — by person or by occasion — is each member's own habit,
 * kept by this browser (docs/dev/02 §2.25.6). Only the slice of `Storage` it is handed is touched.
 */

export type ListView = 'person' | 'occasion';

/** The part of `localStorage` the preference needs. */
export type ViewStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface ListViewPreference {
	load(): ListView;
	save(view: ListView): void;
}

export function listViewPreference(storage: ViewStorage, userId: string): ListViewPreference {
	const key = `stella.gifts.listView.${userId}`;
	return {
		load() {
			try {
				return storage.getItem(key) === 'occasion' ? 'occasion' : 'person';
			} catch {
				// Storage can be blocked (private mode, a site setting); it stays by person.
				return 'person';
			}
		},
		save(view) {
			try {
				storage.setItem(key, view);
			} catch {
				// Not remembered, still applied for this visit.
			}
		}
	};
}
