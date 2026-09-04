/*
 * The design-token table (docs/05 §5.2.2), in TypeScript.
 *
 * Components colour themselves through these helpers only. The raw Catppuccin flavour
 * variables (`--ctp-*`) never leave `app.css`: every accent a component can reach is
 * published there as a semantic `--accent-*`, `--cat-*` or `--kind-*` token, so swapping a
 * flavour — or letting a household pick its own accent — stays a one-file change.
 *
 * Pure and framework-free: the graph adapter, the Svelte components and the unit tests all
 * read the same table.
 */

/** Every accent the palette publishes, in the order the colour pickers offer them. */
export const ACCENTS = [
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

/** One of `ACCENTS`. Tag and circle colours are stored as these names. */
export type Accent = (typeof ACCENTS)[number];

/**
 * Accents an avatar may be generated in. Red is left out on purpose: it is the danger
 * signal everywhere else, and a person is never a warning.
 */
export const AVATAR_ACCENTS = ACCENTS.filter((accent) => accent !== 'red');

/** Relationship categories, each with a fixed accent (docs/05 §5.6). */
export const RELATIONSHIP_CATEGORIES = [
	'family',
	'romantic',
	'social',
	'professional',
	'other'
] as const;

/** One of `RELATIONSHIP_CATEGORIES`. */
export type RelationshipCategory = (typeof RELATIONSHIP_CATEGORIES)[number];

/** How strongly a tinted surface mixes its accent into the background. */
const CHIP_TINT_PERCENT = 16;
const CHIP_ACTIVE_TINT_PERCENT = 28;
const AVATAR_TINT_PERCENT = 22;

/** The CSS variable that carries an accent. */
export function accentVar(accent: Accent): string {
	return `var(--accent-${accent})`;
}

/** The CSS variable that carries a relationship category's fixed accent. */
export function categoryVar(category: RelationshipCategory): string {
	return `var(--cat-${category})`;
}

/**
 * Inline style for a tag or filter chip: a tint of its accent, labelled in `--fg`.
 *
 * The label deliberately does *not* take the accent. Catppuccin's accents are picked to sing
 * against the page, and in Latte most of them land between 2.6:1 and 3.7:1 against a tint of
 * themselves — below AA at any size. So the accent identifies the chip and the foreground
 * reads it (docs/05 §5.6); `contrast.test.ts` holds that pairing to 4.5:1 in both themes.
 */
export function accentChipStyle(accent: Accent, options?: { active?: boolean }): string {
	const tint = options?.active ? CHIP_ACTIVE_TINT_PERCENT : CHIP_TINT_PERCENT;
	return `background:color-mix(in srgb, ${accentVar(accent)} ${tint}%, transparent);color:var(--fg)`;
}

/**
 * Inline style for an initials avatar: the disc carries the person's accent, the initials are
 * written in `--fg` for the same reason a chip's label is. Mixed over `--card` rather than
 * transparent so the avatar stays opaque when it overlaps another one in a stack.
 */
export function accentAvatarStyle(accent: Accent): string {
	return (
		`background:color-mix(in srgb, ${accentVar(accent)} ${AVATAR_TINT_PERCENT}%, var(--card));` +
		`color:var(--fg)`
	);
}

/** Inline style for a solid colour dot, as used by circles and legends. */
export function accentDotStyle(accent: Accent): string {
	return `background:${accentVar(accent)}`;
}
