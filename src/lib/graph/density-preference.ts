import { parseDensity, type Density } from './layout/density';

/*
 * The adapter that keeps the graph's density per device (docs/05 §5.8). What a stored value
 * means is decided in `layout/density.ts`; this only reads and writes it, through the slice of
 * `Storage` it is handed, so it tests with a map instead of a browser.
 */

/** The part of `localStorage` the preference needs. */
export type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

const KEY = 'stella.graph.density';

export interface DensityPreference {
	load(): Density;
	save(density: Density): void;
}

export function densityPreference(storage: PreferenceStorage): DensityPreference {
	return {
		load() {
			try {
				return parseDensity(storage.getItem(KEY));
			} catch {
				// Storage can be blocked (private mode, a site setting); the default stands.
				return parseDensity(null);
			}
		},
		save(density) {
			try {
				storage.setItem(KEY, density);
			} catch {
				// Not remembered, still applied for this visit.
			}
		}
	};
}
