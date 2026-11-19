import {
	densityPreference,
	type DensityPreference,
	type PreferenceStorage
} from '#lib/graph/density-preference.js';
import type { KeptPreferences } from '#lib/graph/explorer-state.js';
import {
	savedViewsPreference,
	type SavedViewsPreference
} from '#lib/graph/saved-views-preference.js';
import { treeOrderPreference, type TreeOrderPreference } from '#lib/graph/tree-order-preference.js';
import { viewSwitchPreference, type ViewSwitchPreference } from '#lib/graph/view-switches.js';

/** Where the explorer keeps each habit; one is missing when storage refused it. */
export interface PreferenceStores {
	switches?: ViewSwitchPreference;
	density?: DensityPreference;
	views?: SavedViewsPreference;
	/** Read per centre person once the map knows its centre, so it carries no `kept` value. */
	treeOrders?: TreeOrderPreference;
}

/*
 * The habits this browser keeps (docs/dev/05 §5.8, docs/dev/02 §2.7): the Filter menu's switches, the
 * density, and the saved views — named Filter-menu states, never the centre or anybody's
 * position, since a view is how to look, not where — and the family tree's dragged row orders,
 * per centre person. `storage` is a getter because merely reading
 * `localStorage` throws where storage is blocked; the defaults then stand.
 */
export function loadKeptPreferences(storage: () => PreferenceStorage): {
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
		stores.treeOrders = treeOrderPreference(storage());
	} catch {
		// Storage can be blocked; the defaults stand.
	}
	return { stores, kept };
}
