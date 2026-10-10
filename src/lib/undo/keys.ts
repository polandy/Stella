/*
 * Keys for deferred removals (docs/02 §2.23). A key identifies one thing on screen for as
 * long as its undo window is open: the list that holds it hides the row whose key is pending,
 * and the store commits at most one removal per key.
 */

/** The kinds of thing that can be removed with undo. */
export const REMOVAL_KINDS = [
	'journal',
	'interaction',
	'note',
	/* A photo of a person's gallery, or of a circle's. */
	'photo',
	'circle-photo',
	'field',
	'date',
	'gift',
	'tag',
	'membership',
	'relationship',
	'relationship-type',
	/* A suggestion answered on a review screen; its id is the claim's, never the rule's. */
	'suggestion',
	/* A row of *Find your people* being ignored; its id is the contact's. */
	'immich-ignore',
	/* An ignored pair being proposed again; its id is `contact/person`. */
	'immich-ignored',
	/* A face of *New from Immich* being ignored; its id is the Immich person's. */
	'immich-newcomer-ignore',
	/* An ignored face of *New from Immich* being proposed again; its id is the Immich person's. */
	'immich-newcomer-ignored'
] as const;

export type RemovalKind = (typeof REMOVAL_KINDS)[number];

/** The key for one removable thing; unique across kinds even when ids repeat. */
export function removalKey(kind: RemovalKind, id: string): string {
	return `${kind}:${id}`;
}
