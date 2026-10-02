import { DEFAULT_VIEW_SWITCHES, type ViewSwitches } from '../view-switches';
import { FILTER_KEYS, type FilterKey } from './view-filters';

/*
 * Saved views (docs/02 §2.7): a name the reader gives to a Filter-menu state — the kinds of
 * line shown and the switches for looking at them — so a way of reading the map is one tap
 * away. Not the centre person and not where anybody stands: a view is how to look, not where.
 * Kept per device; `saved-views-preference.ts` only reads and writes what this decides.
 */

/** One saved view, as it is kept. */
export interface SavedView {
	name: string;
	/** The kinds of line shown, in the order the Filter menu lists them. */
	filters: FilterKey[];
	switches: ViewSwitches;
}

/** The part of the explorer's state a view captures and restores. */
export interface ViewState {
	active: ReadonlySet<string>;
	switches: Readonly<ViewSwitches>;
}

const SWITCH_NAMES = Object.keys(DEFAULT_VIEW_SWITCHES) as (keyof ViewSwitches)[];

// Names are compared as a reader would: "Family" and "family " are one view.
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The list with the current state saved under `name`. A name already saved is replaced in its
 * place, so re-saving a view updates it rather than adding a twin; a blank name saves nothing.
 */
export function saveView(views: readonly SavedView[], name: string, state: ViewState): SavedView[] {
	const trimmed = name.trim();
	if (!trimmed) return views as SavedView[];
	const view: SavedView = {
		name: trimmed,
		filters: FILTER_KEYS.filter((key) => state.active.has(key)),
		switches: { ...state.switches }
	};
	const at = views.findIndex((v) => sameName(v.name, trimmed));
	if (at < 0) return [...views, view];
	return views.map((v, i) => (i === at ? view : v));
}

/** The list without the view called `name`. */
export function removeView(views: readonly SavedView[], name: string): SavedView[] {
	return views.filter((v) => !sameName(v.name, name));
}

/** The saved view the map shows right now, if any — the menu ticks it. */
export function viewMatching(views: readonly SavedView[], state: ViewState): string | null {
	const shown = FILTER_KEYS.filter((key) => state.active.has(key));
	const match = views.find(
		(v) =>
			v.filters.length === shown.length &&
			v.filters.every((key, i) => key === shown[i]) &&
			SWITCH_NAMES.every((name) => v.switches[name] === state.switches[name])
	);
	return match?.name ?? null;
}

export function serializeSavedViews(views: readonly SavedView[]): string {
	return JSON.stringify(views);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const isFilterKey = (value: unknown): value is FilterKey =>
	(FILTER_KEYS as readonly unknown[]).includes(value);

/*
 * One stored entry, or null for one this version cannot honour. A view naming a filter or a
 * switch that no longer exists would not show what it was saved to show, so it is dropped
 * rather than half-applied; a switch it does not mention (one added since) takes its default.
 */
function parseEntry(entry: unknown): SavedView | null {
	if (!isRecord(entry)) return null;
	const { name, filters, switches } = entry;
	if (typeof name !== 'string' || !name.trim()) return null;
	if (!Array.isArray(filters) || !filters.every(isFilterKey)) return null;
	if (!isRecord(switches)) return null;
	const parsed: ViewSwitches = { ...DEFAULT_VIEW_SWITCHES };
	for (const [key, on] of Object.entries(switches)) {
		if (!(SWITCH_NAMES as string[]).includes(key) || typeof on !== 'boolean') return null;
		parsed[key as keyof ViewSwitches] = on;
	}
	return {
		name: name.trim(),
		filters: FILTER_KEYS.filter((key) => filters.includes(key)),
		switches: parsed
	};
}

/**
 * The views kept in `stored`. Anything unreadable reads as no views, and an entry this version
 * cannot honour is dropped on its own: a stale device must never break the Filter menu.
 */
export function parseSavedViews(stored: string | null): SavedView[] {
	if (stored === null) return [];
	let raw: unknown;
	try {
		raw = JSON.parse(stored);
	} catch {
		// Not JSON — written by something else, or cut short. Nothing in it can be trusted.
		return [];
	}
	if (!Array.isArray(raw)) return [];
	const views: SavedView[] = [];
	for (const entry of raw) {
		const view = parseEntry(entry);
		if (view && !views.some((v) => sameName(v.name, view.name))) views.push(view);
	}
	return views;
}
