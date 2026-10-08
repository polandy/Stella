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
	/**
	 * The size the map was last framed for, once full screen has been entered or left and until
	 * the reader moves the view: each new size the canvas settles at is framed for. Null while the
	 * canvas size is not followed.
	 */
	reframeFrom: ViewSize | null;
}

/**
 * What happened to the view:
 * - `framed`: the map framed itself — an arrangement, a tidy-up, a reframe.
 * - `navigated`: the reader moved the view — a drag, a pinch, the wheel, the keyboard.
 * - `screenChanged`: full screen was entered or left, the canvas still at `size`.
 * - `resized`: the canvas has taken `size`.
 */
export type ViewEvent =
	| { kind: 'framed' }
	| { kind: 'navigated' }
	| { kind: 'screenChanged'; size: ViewSize }
	| { kind: 'resized'; size: ViewSize };

/** A fresh canvas: its view is the one it framed itself, and nothing waits. */
export const FOLLOWING: ViewFollow = { navigated: false, reframeFrom: null };

const sameSize = (a: ViewSize, b: ViewSize) => a.width === b.width && a.height === b.height;
const empty = (size: ViewSize) => size.width <= 0 || size.height <= 0;

/**
 * The state after `event`, and whether the map is to be framed afresh now. After a full-screen
 * change, every resize that gives the canvas a new, non-empty size reframes — the canvas resizes
 * after the change, not with it, can take its new size in more than one step (the width before
 * the height), and also reports resizes that changed nothing. The reader moving the view stops
 * it until the next full-screen change.
 */
export function followView(
	state: ViewFollow,
	event: ViewEvent
): { state: ViewFollow; reframe: boolean } {
	switch (event.kind) {
		case 'framed':
			return { state: { ...state, navigated: false }, reframe: false };
		case 'navigated':
			return { state: { navigated: true, reframeFrom: null }, reframe: false };
		case 'screenChanged':
			return {
				state: { ...state, reframeFrom: state.navigated ? null : event.size },
				reframe: false
			};
		case 'resized': {
			const from = state.reframeFrom;
			if (!from || empty(event.size) || sameSize(from, event.size)) {
				return { state, reframe: false };
			}
			return { state: { ...state, reframeFrom: event.size }, reframe: true };
		}
	}
}
