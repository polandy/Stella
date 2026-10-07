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

import type { RelationshipCategory } from '../relationships/categories';

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

/**
 * How strongly a tinted surface mixes its accent in, per flavour (docs/05 §5.2.2) — one number
 * per theme, never per component. `app.css` publishes them as `--tint-avatar`, `--tint-chip`
 * and `--tint-chip-active` in each theme block, so the inline styles below stay theme-blind;
 * `color.test.ts` holds the two halves together and every accent to AA at these strengths.
 * Mocha's dark ground swallows a light tint, so it mixes more: 32 % already drops its
 * lightest accents below 4.5:1 for an avatar, 28 % is the ceiling.
 */
export const TINT_PERCENT = {
	light: { avatar: 22, chip: 16, chipActive: 28 },
	dark: { avatar: 28, chip: 22, chipActive: 28 }
} as const;

/**
 * A ring in the flat accent around an initials avatar, published as `--avatar-ring`. Mocha
 * only: it gives the disc its identity without darkening the ground the initials are read on.
 */
export const AVATAR_RING_PX = { light: 0, dark: 1.5 } as const;

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
	// The active chip is laid over --card rather than see-through: Latte's red at the active
	// strength over the page ground is 4.11:1, over the card 4.87:1.
	const tint = options?.active
		? 'var(--tint-chip-active), var(--card)'
		: 'var(--tint-chip), transparent';
	return `background:color-mix(in srgb, ${accentVar(accent)} ${tint});color:var(--fg)`;
}

/**
 * Inline style for an initials avatar: the disc carries the person's accent, the initials are
 * written in `--fg` for the same reason a chip's label is. Mixed over `--card` rather than
 * transparent so the avatar stays opaque when it overlaps another one in a stack. The ring is
 * zero wide except where the theme sets `--avatar-ring`.
 */
export function accentAvatarStyle(accent: Accent): string {
	return (
		`background:color-mix(in srgb, ${accentVar(accent)} var(--tint-avatar), var(--card));` +
		`box-shadow:inset 0 0 0 var(--avatar-ring) ${accentVar(accent)};color:var(--fg)`
	);
}

/**
 * The fill of an SVG initials disc in a relationship category's colour: the avatar's tint,
 * since the initials on it are written in `--fg` — white on the flat accent fell to 1.5:1 in
 * Mocha (docs/05 §5.9).
 */
export function categoryDiscFill(category: RelationshipCategory): string {
	return `color-mix(in srgb, ${categoryVar(category)} var(--tint-avatar), var(--card))`;
}

/** Inline style for a solid colour dot, as used by circles and legends. */
export function accentDotStyle(accent: Accent): string {
	return `background:${accentVar(accent)}`;
}

/**
 * The one motion everything that opens or closes in place moves with (docs/05 §5.11): a height
 * glides in `expandMs`, content fades in `fadeMs`, both on `easing` — quick to start, gentle to
 * land. `app.css` publishes the same three values as `--motion-expand`, `--motion-fade` and
 * `--ease-standard`; `src/lib/motion/motion.test.ts` holds the two halves together.
 */
export const MOTION = {
	expandMs: 300,
	fadeMs: 200,
	easing: 'cubic-bezier(0.2, 0, 0, 1)'
} as const;
