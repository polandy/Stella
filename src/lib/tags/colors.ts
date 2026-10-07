/*
 * The colours a tag may have (docs/02 §2.8), one per Catppuccin accent. Pure and client-safe,
 * so the command schema a phone's outbox is read with checks against the same list the
 * domain stores.
 */

export const TAG_COLORS = [
	'rosewater',
	'flamingo',
	'pink',
	'mauve',
	'red',
	'maroon',
	'peach',
	'yellow',
	'green',
	'teal',
	'sky',
	'sapphire',
	'blue',
	'lavender'
] as const;

export type TagColor = (typeof TAG_COLORS)[number];
