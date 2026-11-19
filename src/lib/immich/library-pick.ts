/*
 * Picking from the whole Immich library (docs/dev/02 §2.24.9): which photos are ticked, numbered in
 * the order they were tapped, and what the picker asks Stella for. Pure; the sheet is
 * `$lib/components/immich/ImmichLibraryPicker.svelte`.
 */

import type { LibraryPhoto } from './library';

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

/** The ticked photos for the tray, each with its number; a tick whose photo was never seen is left out. */
export function tickTray(
	ticked: readonly string[],
	seen: ReadonlyMap<string, LibraryPhoto>
): { number: number; photo: LibraryPhoto }[] {
	return ticked.flatMap((id, at) => {
		const photo = seen.get(id);
		return photo ? [{ number: at + 1, photo }] : [];
	});
}

/**
 * A day of the library, a search across it, or a page of a month or an album from `cursor` (null for the
 * first) — the route is `src/routes/(app)/immich/library`.
 */
export type LibraryQuery =
	| { day: string }
	| { query: string }
	| { month: string; cursor: string | null }
	| { album: string; cursor: string | null };

export function libraryQueryUrl(asked: LibraryQuery): string {
	if ('day' in asked) return `/immich/library?${new URLSearchParams({ day: asked.day })}`;
	if ('query' in asked) return `/immich/library?${new URLSearchParams({ q: asked.query })}`;
	const { cursor, ...source } = asked;
	const params = new URLSearchParams({ ...source, ...(cursor === null ? {} : { cursor }) });
	return `/immich/library?${params}`;
}
