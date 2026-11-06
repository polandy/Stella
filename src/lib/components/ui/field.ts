/*
 * The one look of a text field (docs/05 §5.7): its edge, surface and text, and — through the
 * `field` class in app.css — the focus ring drawn on that edge (§5.9). Padding, text size and
 * width are the caller's, since an inline edit is denser than a form; the look is not.
 */

const EDGE = 'rounded-control border border-border-input text-fg placeholder:text-fg-subtle';

/** A field on a card. */
export const FIELD = `field ${EDGE} bg-bg`;

/** A field on the page background or a sunken panel, where `bg-bg` would vanish into it. */
export const FIELD_ON_BG = `field ${EDGE} bg-card`;

/**
 * A frame that holds a bare input beside something else — a search icon, a row of chips — and
 * draws the field's edge and focus ring for it. The surface is the caller's.
 */
export const FIELD_FRAME = 'field-frame rounded-control border border-border-input';
