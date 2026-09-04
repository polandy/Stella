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
	/** Name of the icon for the timeline dot; decorative, always paired with the label. */
	icon: InteractionKind;
	/** The kind's semantic colour token (docs/05 §5.6), for the dot and the kind label. */
	accent: string;
}

/** Label, icon and accent per kind — the single table both timeline and stream render from. */
export const KIND_PRESENTATION: Record<InteractionKind, KindPresentation> = {
	met: { label: 'Met in person', icon: 'met', accent: 'var(--kind-met)' },
	call: { label: 'Call', icon: 'call', accent: 'var(--kind-call)' },
	video: { label: 'Video call', icon: 'video', accent: 'var(--kind-video)' },
	message: { label: 'Message', icon: 'message', accent: 'var(--kind-message)' },
	letter: { label: 'Letter', icon: 'letter', accent: 'var(--kind-letter)' },
	gift: { label: 'Gift', icon: 'gift', accent: 'var(--kind-gift)' },
	other: { label: 'Other', icon: 'other', accent: 'var(--kind-other)' }
};
