/*
 * Picking from the whole Immich library (docs/02 §2.24.9): which photos are ticked, numbered in
 * the order they were tapped, and what the picker asks Stella for. Pure; the sheet is
 * `$lib/components/immich/ImmichLibraryPicker.svelte`.
 */

/** The most photos one pick copies: each is fetched and re-encoded in the browser, one by one. */
export const LIBRARY_PICK_LIMIT = 20;

/** The ticks after a tap on `id`: unticked when it was ticked, else ticked last while there is room. */
export function toggledTick(ticked: readonly string[], id: string): readonly string[] {
	if (ticked.includes(id)) return ticked.filter((other) => other !== id);
	if (ticked.length >= LIBRARY_PICK_LIMIT) return ticked;
	return [...ticked, id];
}

/** The number a ticked photo shows, from 1; null when it is not ticked. */
export function tickNumber(ticked: readonly string[], id: string): number | null {
	const at = ticked.indexOf(id);
	return at === -1 ? null : at + 1;
}

/** A day of the library, or a search across it — the route is `src/routes/(app)/immich/library`. */
export type LibraryQuery = { day: string } | { query: string };

export function libraryQueryUrl(asked: LibraryQuery): string {
	const params = new URLSearchParams('day' in asked ? { day: asked.day } : { q: asked.query });
	return `/immich/library?${params}`;
}
