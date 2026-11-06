/*
 * The classes and data fields the graph controller sets on the canvas and the stylesheet
 * draws (docs/05 §5.8): one name each, shared by both sides.
 */

/** The class and data field a bent line carries; the controller sets them, this draws them. */
export const BOWED_CLASS = 'bowed';
export const BOW_FIELD = 'bow';
/** The class a line a bundle stands for carries (docs/02 §2.7); drawn only while selected. */
export const TUCKED_CLASS = 'tucked';
/** The class the node the keyboard is on carries (docs/05 §5.8); the controller sets it. */
export const CURSOR_CLASS = 'cursor';
/** The class a line carries while the pointer rests on it or on either of its ends. */
export const HOVERED_CLASS = 'hovered';
/** The class a node carries while expanding it would bring more people in (`elements.ts`). */
export const HAS_MORE_CLASS = 'has-more';
/** The class the selected person, their neighbours and a traced path carry while lit. */
export const LIT_CLASS = 'lit';
/**
 * The class a line drawn at right angles carries, and the data fields its bends and ends are
 * read from (`segments.ts`); the controller sets them, this draws them.
 */
export const ROUTED_CLASS = 'routed';
export const ROUTE_FIELDS = {
	weights: 'segmentWeights',
	distances: 'segmentDistances',
	sourceEndpoint: 'sourceEndpoint',
	targetEndpoint: 'targetEndpoint',
	nameEnd: 'nameEnd'
} as const;
/** The class of a caption the controller writes onto the canvas: words, not somebody to tap. */
export const CAPTION_CLASS = 'caption';
/** The class of a missing parent's slot in the family tree, and of its line (`elements.ts`). */
export const SLOT_CLASS = 'slot';
