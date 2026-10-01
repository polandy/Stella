import type { PreferenceStorage } from './density-preference';

/*
 * The adapter that keeps the Filter menu's switches per device (docs/05 §5.8): how a map is
 * looked at is a habit, not a filter, so this browser keeps it. Like `density-preference.ts`
 * it only reads and writes, through the slice of `Storage` it is handed.
 */

/** The Filter menu's on/off switches. */
export interface ViewSwitches {
	/**
	 * Every line named. On by default: with the lines that only repeat a chain left off, the
	 * names left are what the map is read by.
	 */
	edgeLabels: boolean;
	/** The circles grouped by role (docs/02 §2.7): off by default. */
	groupRoles: boolean;
	/** The links between members of one group, while grouping is on. */
	innerLinks: boolean;
	/** Every derived line, including those whose chain is already drawn — for reading the whole family. */
	allKinship: boolean;
}

export const DEFAULT_VIEW_SWITCHES: Readonly<ViewSwitches> = {
	edgeLabels: true,
	groupRoles: false,
	innerLinks: true,
	allKinship: false
};

/** Where each switch has always been kept; changing one forgets every reader's choice. */
const KEYS: Record<keyof ViewSwitches, string> = {
	edgeLabels: 'stella.graph.edgeLabels',
	groupRoles: 'stella.graph.groupByRole',
	innerLinks: 'stella.graph.innerLinks',
	allKinship: 'stella.graph.allKinship'
};

export interface ViewSwitchPreference {
	load(): ViewSwitches;
	save(name: keyof ViewSwitches, on: boolean): void;
}

export function viewSwitchPreference(storage: PreferenceStorage): ViewSwitchPreference {
	// A switch that starts on stays on unless it was turned off, and the reverse.
	const read = (name: keyof ViewSwitches) =>
		DEFAULT_VIEW_SWITCHES[name]
			? storage.getItem(KEYS[name]) !== 'off'
			: storage.getItem(KEYS[name]) === 'on';
	return {
		load() {
			try {
				return {
					groupRoles: read('groupRoles'),
					innerLinks: read('innerLinks'),
					allKinship: read('allKinship'),
					edgeLabels: read('edgeLabels')
				};
			} catch {
				// Storage can be blocked; the defaults stand.
				return { ...DEFAULT_VIEW_SWITCHES };
			}
		},
		save(name, on) {
			try {
				storage.setItem(KEYS[name], on ? 'on' : 'off');
			} catch {
				// Not remembered, still applied for this visit.
			}
		}
	};
}
