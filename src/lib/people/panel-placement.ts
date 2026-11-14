/** Edges of a box on the page's vertical axis, in the layout viewport's coordinates. */
export interface Span {
	top: number;
	bottom: number;
}

/** About 12rem: less than this under the field and the list flips above it. */
export const PANEL_MIN_BELOW_PX = 192;
const GAP_PX = 8;

export interface PanelPlacement {
	side: 'below' | 'above';
	/** The room on that side, for the panel to scroll within instead of overflowing. */
	maxHeight: number;
}

/**
 * Where a picker's result list opens: under the field, or above it when the room below is
 * tight (a phone with the keyboard up) and the room above is larger. `view` is the visible
 * area, so a keyboard-shrunk visual viewport counts.
 */
export function panelPlacement({ field, view }: { field: Span; view: Span }): PanelPlacement {
	const below = view.bottom - field.bottom - GAP_PX;
	const above = field.top - view.top - GAP_PX;
	const side = below < PANEL_MIN_BELOW_PX && above > below ? 'above' : 'below';
	return { side, maxHeight: Math.max(0, side === 'above' ? above : below) };
}

/** Whether any of the field is still visible; the list follows it and closes once it is gone. */
export function fieldInView(field: Span, view: Span): boolean {
	return field.bottom > view.top && field.top < view.bottom;
}
