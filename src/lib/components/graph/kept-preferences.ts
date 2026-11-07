import { densityPreference, type DensityPreference } from '$lib/graph/density-preference';
import type { KeptPreferences } from '$lib/graph/explorer-state';
import { savedViewsPreference, type SavedViewsPreference } from '$lib/graph/saved-views-preference';
import { viewSwitchPreference, type ViewSwitchPreference } from '$lib/graph/view-switches';

/** Where the explorer keeps each habit; one is missing when storage refused it. */
export interface PreferenceStores {
	switches?: ViewSwitchPreference;
	density?: DensityPreference;
	views?: SavedViewsPreference;
}

/*
 * The habits this browser keeps (docs/05 §5.8, docs/02 §2.7): the Filter menu's switches, the
 * density, and the saved views — named Filter-menu states, never the centre or anybody's
 * position, since a view is how to look, not where. `storage` is a getter because merely reading
 * `localStorage` throws where storage is blocked; the defaults then stand.
 */
export function loadKeptPreferences(storage: () => Storage): {
	stores: PreferenceStores;
	kept: KeptPreferences;
} {
	const stores: PreferenceStores = {};
	const kept: KeptPreferences = {};
	try {
		stores.switches = viewSwitchPreference(storage());
		kept.switches = stores.switches.load();
		stores.density = densityPreference(storage());
		kept.density = stores.density.load();
		stores.views = savedViewsPreference(storage());
		kept.savedViews = stores.views.load();
	} catch {
		// Storage can be blocked; the defaults stand.
	}
	return { stores, kept };
}
