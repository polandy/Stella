/*
 * Interaction kinds (docs/02 §2.6) and how each reads on screen. Pure and framework-free so
 * the domain can validate against the same list the timeline renders — one table, no drift.
 * Accents follow docs/05 §5.6: a fixed hue per kind, consistent across timeline and stream.
 */

/** Every kind an interaction can have, in the order the form offers them. */
export const INTERACTION_KINDS = [
	'met',
	'call',
	'video',
	'message',
	'letter',
	'gift',
	'other'
] as const;

/** One of `INTERACTION_KINDS`. */
export type InteractionKind = (typeof INTERACTION_KINDS)[number];

/** How a kind reads on screen. */
export interface KindPresentation {
	label: string;
	/** A glyph for the timeline dot; decorative, always paired with the label. */
	icon: string;
	/** CSS colour for the dot and kind label; neutral for "other". */
	accent: string;
}

/** Label, glyph and accent per kind — the single table both timeline and stream render from. */
export const KIND_PRESENTATION: Record<InteractionKind, KindPresentation> = {
	met: { label: 'Met in person', icon: '🤝', accent: 'var(--ctp-green)' },
	call: { label: 'Call', icon: '📞', accent: 'var(--ctp-blue)' },
	video: { label: 'Video call', icon: '🎥', accent: 'var(--ctp-sapphire)' },
	message: { label: 'Message', icon: '💬', accent: 'var(--ctp-teal)' },
	letter: { label: 'Letter', icon: '✉️', accent: 'var(--ctp-peach)' },
	gift: { label: 'Gift', icon: '🎁', accent: 'var(--ctp-pink)' },
	other: { label: 'Other', icon: '•', accent: 'var(--fg-subtle)' }
};
