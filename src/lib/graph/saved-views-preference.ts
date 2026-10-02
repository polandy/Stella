import type { PreferenceStorage } from './density-preference';
import { parseSavedViews, serializeSavedViews, type SavedView } from './model/saved-views';

/*
 * The adapter that keeps the explorer's saved views per device (docs/02 §2.7). What a stored
 * list means — and which entries are too old to honour — is decided in `model/saved-views.ts`;
 * this only reads and writes it, through the slice of `Storage` it is handed.
 */

const KEY = 'stella.graph.savedViews';

export interface SavedViewsPreference {
	load(): SavedView[];
	save(views: readonly SavedView[]): void;
}

export function savedViewsPreference(storage: PreferenceStorage): SavedViewsPreference {
	return {
		load() {
			try {
				return parseSavedViews(storage.getItem(KEY));
			} catch {
				// Storage can be blocked (private mode, a site setting); there are no views then.
				return [];
			}
		},
		save(views) {
			try {
				storage.setItem(KEY, serializeSavedViews(views));
			} catch {
				// Not remembered, still offered for this visit.
			}
		}
	};
}
