/*
 * Where keyboard focus goes when the control holding it disappears (WCAG 2.4.3, docs/05 §5.7).
 *
 * A form that closes after Save or Cancel takes its focused field with it; a row that leaves
 * its list on Remove takes its focused button. Either way the browser drops focus on the page
 * itself, and the next Tab starts again at the top of the document. These decide where it goes
 * instead; the components only read the page and move it there.
 */

/** One row of a list as it stands in the page, in reading order. */
export interface ListedRow {
	readonly key: string;
	/** On its way out — removed or answered a moment earlier — and so not a place to land. */
	readonly leaving: boolean;
}

/**
 * The row to land on once `gone` has left: the next one still standing — the one that moves up
 * into its place, which keeps a run of removals going — or, with nothing left below, the
 * nearest one above. `null` when no row is left, which the caller answers with the list's
 * heading.
 */
export function neighbourAfterLeaving(rows: readonly ListedRow[], gone: string): string | null {
	const at = rows.findIndex((r) => r.key === gone);
	if (at === -1) return null;
	const standing = (r: ListedRow) => !r.leaving;
	const next = rows.slice(at + 1).find(standing) ?? rows.slice(0, at).findLast(standing);
	return next?.key ?? null;
}

/**
 * Whether a closed form owes focus back to the button that opens it: only when focus was in it
 * and the browser has since dropped it on the page. A reader who has already put focus
 * somewhere else keeps it there, and a form closed from elsewhere pulls nothing.
 */
export function owesFocusBack(state: {
	hadFocusInside: boolean;
	focusNow: 'page' | 'elsewhere';
}): boolean {
	return state.hadFocusInside && state.focusNow === 'page';
}
