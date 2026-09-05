/*
 * Keys for deferred removals (docs/02 §2.23). A key identifies one thing on screen for as
 * long as its undo window is open: the list that holds it hides the row whose key is pending,
 * and the store commits at most one removal per key.
 */

/** The kinds of thing that can be removed with undo. */
export const REMOVAL_KINDS = [
	'journal',
	'interaction',
	'field',
	'date',
	'tag',
	'membership'
] as const;

export type RemovalKind = (typeof REMOVAL_KINDS)[number];

/** The key for one removable thing; unique across kinds even when ids repeat. */
export function removalKey(kind: RemovalKind, id: string): string {
	return `${kind}:${id}`;
}
