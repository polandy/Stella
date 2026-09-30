/*
 * Where keyboard focus goes once an answered suggestion row has left its list (docs/05 §5.5).
 *
 * The *Accept* and *Decline* buttons live inside the row, and the row leaves the moment it is
 * answered — so the focused button leaves with it, and the browser drops focus on the page
 * itself. The next Tab would then start again at the top of the document. This decides where
 * focus goes instead; `KinSuggestions.svelte` only reads the list and moves it there.
 */

/** Which of a row's two answers had focus. The same one is focused on the row that follows. */
export type AnswerControl = 'accept' | 'decline';

/** One row of the list as it stands in the page, in reading order. */
export interface ListedRow {
	readonly key: string;
	/** On its way out — answered a moment earlier in a quick run — and so not a place to land. */
	readonly leaving: boolean;
}

/**
 * Where focus is when the answered row has gone: nowhere (the browser dropped it on the page),
 * still inside the leaving row, or somewhere the reader has put it since.
 */
export type FocusNow = 'nowhere' | 'leaving-row' | 'elsewhere';

/** A row's control to focus, or the list's own heading when no row is left to take it. */
export type AnswerFocus = { readonly row: string; readonly control: AnswerControl } | 'heading';

/**
 * The target after `answered` has left: the same control of the next row still standing — the
 * one that moved up into its place, which keeps a run of answers going — or, with nothing left
 * below, the nearest row above; the heading once the list is empty.
 *
 * `null` when the reader has already moved focus elsewhere: pulling it back would take their
 * place away a second time.
 */
export function focusAfterAnswer(
	rows: readonly ListedRow[],
	answered: string,
	control: AnswerControl,
	focus: FocusNow
): AnswerFocus | null {
	if (focus === 'elsewhere') return null;
	const at = rows.findIndex((r) => r.key === answered);
	if (at === -1) return 'heading';
	const standing = (r: ListedRow) => !r.leaving;
	const next = rows.slice(at + 1).find(standing) ?? rows.slice(0, at).findLast(standing);
	return next ? { row: next.key, control } : 'heading';
}

/**
 * Whether an answer owes focus back at all: only when it was given from the answer button
 * itself, with focus the reader can see — a keyboard. A click focuses the button too in most
 * browsers, but without a ring; moving focus for a pointer reader could scroll the page towards
 * the heading and undo the hold that keeps the list still under their hand (docs/05 §5.5).
 */
export function owesFocus(focus: { inAnswer: boolean; visible: boolean }): boolean {
	return focus.inAnswer && focus.visible;
}
