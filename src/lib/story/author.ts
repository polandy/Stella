/*
 * How a story item names who wrote it (docs/02 §2.23, docs/05 §5.5). The viewer is "you";
 * anyone else is called by the first part of their name, which is what a household says out
 * loud. A member who has since been removed leaves an item with no name, and the item says
 * nothing rather than inventing one.
 */

/** What the viewer is called on their own items. */
export const SELF_LABEL = 'you';

/** The name the story puts on an item, or `null` when there is nobody to name. */
export function authorLabel(mine: boolean, name: string | null): string | null {
	if (mine) return SELF_LABEL;
	if (name === null) return null;
	const first = name.trim().split(/\s+/)[0];
	return first.length > 0 ? first : null;
}
