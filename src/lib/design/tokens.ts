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
const AVATAR_TINT_PERCENT = 20;
/** How much accent survives in a label that has to stay readable on that tint. */
const READABLE_ACCENT_PERCENT = 68;

/** The CSS variable that carries an accent. */
export function accentVar(accent: Accent): string {
	return `var(--accent-${accent})`;
}

/** The CSS variable that carries a relationship category's fixed accent. */
export function categoryVar(category: RelationshipCategory): string {
	return `var(--cat-${category})`;
}

/**
 * An accent pulled towards the text colour, for a label sitting on a tint of that accent.
 * The raw accents are chosen to sing against the page, not to be read at 12px on a pale wash
 * of themselves; mixing towards `--fg` darkens the label in Latte and lightens it in Mocha,
 * because `--fg` is whichever end of the ramp reads in that theme.
 */
export function readableAccent(accent: Accent): string {
	return `color-mix(in srgb, ${accentVar(accent)} ${READABLE_ACCENT_PERCENT}%, var(--fg))`;
}

/** Inline style for a tag or filter chip: a tint of its accent, labelled in a readable mix. */
export function accentChipStyle(accent: Accent, options?: { active?: boolean }): string {
	const tint = options?.active ? CHIP_ACTIVE_TINT_PERCENT : CHIP_TINT_PERCENT;
	return (
		`background:color-mix(in srgb, ${accentVar(accent)} ${tint}%, transparent);` +
		`color:${readableAccent(accent)}`
	);
}

/**
 * Inline style for an initials avatar. Mixed over `--card` rather than transparent, so the
 * avatar stays opaque when it overlaps another avatar in a stack.
 */
export function accentAvatarStyle(accent: Accent): string {
	return (
		`background:color-mix(in srgb, ${accentVar(accent)} ${AVATAR_TINT_PERCENT}%, var(--card));` +
		`color:${readableAccent(accent)}`
	);
}

/** Inline style for a solid colour dot, as used by circles and legends. */
export function accentDotStyle(accent: Accent): string {
	return `background:${accentVar(accent)}`;
}
