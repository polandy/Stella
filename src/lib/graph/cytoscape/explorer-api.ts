import type { CyElement } from './elements';
import type { Arrangement, Size } from '../layout/geometry';
import type { Spacing } from '../layout/density';
import type { Point } from './placement';
import type { Captions } from './tree-canvas';
import type { CyStyle } from './stylesheet';

/*
 * What the explorer canvas offers its caller (`explorer.ts` builds it): the one surface through
 * which the map component drives Cytoscape.
 */

export interface ExplorerHandlers {
	onTapNode: (id: string) => void;
	onTapBackground: () => void;
}

/** What the controller needs beyond the core; the core already carries its own container. */
export interface ControllerOptions extends ExplorerHandlers {
	reducedMotion: boolean;
	/** Screen pixels the toolbar covers at the top, from the start — see `setTopInset`. */
	topInset?: number;
	/** How far apart people are set, from the start — see `setSpacing`. */
	spacing?: Spacing;
	/**
	 * The screen's device pixels per CSS pixel, which decides how far out the canvas still draws
	 * the names (`legibleZoom`); framing never goes further. 1 when not given.
	 */
	pixelRatio?: number;
}

export interface ExplorerOptions extends ControllerOptions {
	container: HTMLElement;
	elements: CyElement[];
	stylesheet: CyStyle[];
}

export interface ExplorerController {
	/**
	 * Reconcile the full (expanded) element set. Nodes already on the canvas stay where they
	 * are; only the newcomers are placed, clear of everyone, and the view is left alone
	 * unless it has to step back to show them. With `arrangedNext` the caller lays the whole map
	 * out again straight after (the family tree, docs/05 §5.8): the newcomers are then set down
	 * on the person they came from and travel with that arrangement, not on their own first.
	 */
	setGraph(elements: CyElement[], options?: { arrangedNext?: boolean }): void;
	/** Arrange the whole map afresh by the forces between people, and frame it. */
	arrange(): void;
	/**
	 * Glide the map into an arrangement worked out elsewhere (the family tree, the groups by
	 * circle) and frame it. A node without a place in it stays where it is; the lines it says
	 * to bend go around whoever stands in their way, the lines it routes run at right angles,
	 * and every other line is drawn straight. Where it says a shelf of people outside the family
	 * begins, `captions` names it.
	 */
	arrangeAt(arrangement: Arrangement, captions?: Captions): void;
	/** How much room a node takes on the canvas, its name included, in model units. */
	sizeOf(nodeId: string): Size;
	/**
	 * How many screen pixels at the top of the canvas something floats over (the toolbar).
	 * Framing the map, and stepping back to show newcomers, keep the map below them.
	 */
	setTopInset(pixels: number): void;
	/**
	 * How many screen pixels a panel covers at the right or along the foot of the canvas (the
	 * peek panel). The next framing keeps the map clear of them; nothing moves by itself.
	 */
	setCovered(covered: { right: number; bottom: number }): void;
	/**
	 * How far apart people are set (docs/05 §5.8). Moves nobody by itself: the next expand and
	 * the next free arrangement use it.
	 */
	setSpacing(spacing: Spacing): void;
	/** Show only these node/edge ids (filtering), without a re-layout. */
	setVisible(nodeIds: Set<string>, edgeIds: Set<string>): void;
	/** Dim everything except the node and its immediate neighbourhood (null clears). */
	highlightNeighborhood(nodeId: string | null): void;
	/** Emphasise a connection path and dim the rest (null clears). */
	highlightPath(nodeIds: string[] | null): void;
	/** Smoothly centre and zoom onto a node. */
	focus(nodeId: string): void;
	/** Where every node shown stands, in model units — what the keyboard walks (docs/05 §5.8). */
	positions(): Map<string, Point>;
	/**
	 * Ring the node the keyboard is on (null clears), and bring it into view if it stands off
	 * screen or under the toolbar.
	 */
	markCursor(nodeId: string | null): void;
	/**
	 * Full screen was entered or left. Once the canvas has taken its new size, the map is framed
	 * afresh for it — unless the reader has panned or zoomed since the map last framed itself,
	 * in which case their view is kept (docs/05 §5.8).
	 */
	screenChanged(): void;
	/** Re-theme the canvas from a freshly-resolved palette. */
	setStylesheet(stylesheet: CyStyle[]): void;
	/** Tear the canvas down. Idempotent, and every other method no-ops afterwards. */
	destroy(): void;
}
