/*
 * Whether the map is framed afresh for a new canvas size (docs/05 §5.8). Entering or leaving full
 * screen changes how much room the map has; a view the map framed itself is framed again for
 * the new room, but a view the reader has panned or zoomed to is theirs and is kept. Pure, so the
 * rule is tested without a renderer: the canvas adapter reports what happened and does what this
 * says.
 */

/** The canvas's size in screen pixels. */
export interface ViewSize {
	width: number;
	height: number;
}

export interface ViewFollow {
	/** The reader has panned or zoomed since the map last framed itself. */
	navigated: boolean;
	/** The canvas size the map last framed itself for; null before it has. */
	framedFor: ViewSize | null;
	/**
	 * Full screen has been entered or left since the reader last moved the view, so each new size
	 * the canvas settles at is framed for.
	 */
	followingSize: boolean;
}

/**
 * What happened to the view:
 * - `framed`: the map framed itself for a canvas of `size` — an arrangement, a tidy-up, a reframe.
 * - `navigated`: the reader moved the view — a drag, a pinch, the wheel, the keyboard.
 * - `screenChanged`: full screen was entered or left, the canvas last measured at `size`.
 * - `resized`: the canvas has measured itself at `size`.
 */
export type ViewEvent =
	| { kind: 'framed'; size: ViewSize }
	| { kind: 'navigated' }
	| { kind: 'screenChanged'; size: ViewSize }
	| { kind: 'resized'; size: ViewSize };

/** A fresh canvas: nothing framed yet, and no size followed. */
export const FOLLOWING: ViewFollow = { navigated: false, framedFor: null, followingSize: false };

const sameSize = (a: ViewSize, b: ViewSize) => a.width === b.width && a.height === b.height;
const empty = (size: ViewSize) => size.width <= 0 || size.height <= 0;

/** Whether the map, framed for `state.framedFor`, now stands on a canvas of another size. */
const outgrown = (state: ViewFollow, size: ViewSize) =>
	state.framedFor !== null && !empty(size) && !sameSize(state.framedFor, size);

/**
 * The state after `event`, and whether the map is to be framed afresh now. After a full-screen
 * change, the map is framed for every size the canvas measures that it was not framed for —
 * at once if the canvas measured its new size before the change was reported, else on the
 * resize that follows. The canvas also reports resizes that changed nothing, and can take its
 * new size in more than one step (the width before the height). The reader moving the view stops
 * it until the next full-screen change.
 */
export function followView(
	state: ViewFollow,
	event: ViewEvent
): { state: ViewFollow; reframe: boolean } {
	switch (event.kind) {
		case 'framed':
			return { state: { ...state, navigated: false, framedFor: event.size }, reframe: false };
		case 'navigated':
			return { state: { ...state, navigated: true, followingSize: false }, reframe: false };
		case 'screenChanged': {
			if (state.navigated) return { state: { ...state, followingSize: false }, reframe: false };
			return { state: { ...state, followingSize: true }, reframe: outgrown(state, event.size) };
		}
		case 'resized':
			return { state, reframe: state.followingSize && outgrown(state, event.size) };
	}
}
