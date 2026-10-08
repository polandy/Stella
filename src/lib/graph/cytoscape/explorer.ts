import type { Core, CytoscapeOptions, ElementDefinition, NodeCollection } from 'cytoscape';
import type { ControllerOptions, ExplorerController, ExplorerOptions } from './explorer-api';
import { familyIn } from '../layout/geometry';
import { DEFAULT_DENSITY, spacingFor } from '../layout/density';
import type { Point } from './placement';
import { bendLines, writeCaption } from './tree-canvas';
import { CAPTION_CLASS } from './stylesheet';
import { sizeOf } from './canvas-nodes';
import { trackMotion } from './motion';
import { frameOn } from './framing';
import { arrangeOn } from './arranging';
import { reconcile } from './graph-diff';
import {
	highlightNeighborhood,
	highlightPath,
	markCursor,
	nameLinesUnderPointer
} from './highlighting';

/*
 * Imperative Cytoscape controller — the entry to `cytoscape/`, the one folder the library is
 * touched in, and it is dynamically imported so the ~400 KB engine only loads on the explorer route (docs/04 §4.11). It holds no
 * domain rules: callers pass in already-built elements/visibility (from the pure model
 * operations) and it renders, lays out, highlights, and reports taps back. Swapping renderers
 * would touch only this folder.
 */

export type {
	ControllerOptions,
	ExplorerController,
	ExplorerHandlers,
	ExplorerOptions
} from './explorer-api';

/** The furthest out the canvas zooms, whether by the reader or to reveal newcomers. */
const MIN_ZOOM = 0.2;
/** The closest the canvas zooms, whether by the reader or when framing a small map. */
const MAX_ZOOM = 2.5;

/**
 * The controller over an existing core. Split from {@link createExplorer} so the lifecycle can
 * be exercised against a headless core: what matters here is not the drawing but that nothing
 * touches the core once it is gone. It composes the parts — whether the canvas still moves
 * (`motion.ts`), where the view stands (`framing.ts`), moving people (`arranging.ts`),
 * reconciling the elements (`graph-diff.ts`) and lighting them up (`highlighting.ts`).
 */
export function explorerFromCore(cy: Core, opts: ControllerOptions): ExplorerController {
	const duration = opts.reducedMotion ? 0 : 350;
	// How far apart people are set: the reader's density (docs/05 §5.8).
	let spacing = opts.spacing ?? spacingFor(DEFAULT_DENSITY);

	const motion = trackMotion(cy);
	const framing = frameOn(cy, motion, {
		topInset: opts.topInset ?? 0,
		pixelRatio: opts.pixelRatio ?? 1,
		duration
	});
	const arranging = arrangeOn(cy, { motion, framing, spacing: () => spacing, duration });

	cy.on('tap', 'node', (e) => opts.onTapNode(e.target.id()));
	cy.on('tap', (e) => {
		if (e.target === cy) opts.onTapBackground();
	});
	nameLinesUnderPointer(cy);

	/** Nothing reaches a torn-down core: the calls still in flight at teardown fall away here. */
	const alive = () => !cy.destroyed();

	// The first arrangement runs here rather than through the constructor's `layout` option,
	// which lays out before there is anywhere to register `layoutstart` — and so before the
	// running layout could be caught and stopped again. It is simply there: the map has no
	// earlier shape for a glide to start from.
	arranging.glideTo(arranging.forcePositions(), false);

	return {
		setGraph(elements, { arrangedNext = false } = {}) {
			if (!alive()) return;
			// With motion, a newcomer starts on the person it was opened from and travels out.
			const { placements, newcomers, wasEmpty } = reconcile(cy, elements, {
				edgeLength: spacing.edgeLength,
				startAtOrigin: duration !== 0 || arrangedNext
			});
			// Nobody is moved for a removal, nor when the component pushes the same set again on
			// mount — a settled graph that jumps for no reason the viewer can see. An expand moves
			// only the people it brought in (docs/05 §5.8); a canvas that was empty has nothing
			// to keep, and gets a full arrangement.
			if (newcomers === 0) return;
			if (wasEmpty) arranging.glideTo(arranging.forcePositions(), false);
			else if (!arrangedNext) arranging.bringIn(placements);
		},

		arrange() {
			if (!alive()) return;
			writeCaption(cy, undefined, undefined);
			bendLines(cy, { bows: new Map() }, (node) => node.position());
			arranging.glideTo(arranging.forcePositions(), !opts.reducedMotion);
		},

		arrangeAt({ positions, bows, routes, outsideFamily }, captions = {}) {
			if (!alive()) return;
			bendLines(cy, { bows, routes }, (node) => positions.get(node.id()) ?? node.position());
			const captioned = writeCaption(cy, outsideFamily, captions.outsideFamily);
			// The family is what is framed first, should all of it not fit with its names drawn.
			const family = captions.keepNamesDrawn ? familyIn({ positions, outsideFamily }) : undefined;
			arranging.glideTo(new Map([...positions, ...captioned]), !opts.reducedMotion, family);
		},

		sizeOf(nodeId) {
			const node = cy.$id(nodeId);
			if (!alive() || node.empty()) return { width: 0, height: 0 };
			return sizeOf(node);
		},

		setTopInset(pixels) {
			framing.setTopInset(pixels);
		},

		setCovered(next) {
			framing.setCovered(next);
		},

		setSpacing(next) {
			spacing = next;
		},

		setVisible(nodeIds, edgeIds) {
			if (!alive()) return;
			cy.batch(() => {
				// The caption is nobody to filter: it stands whatever is shown.
				cy.nodes()
					.filter((n) => !n.hasClass(CAPTION_CLASS))
					.forEach((n) => {
						n.toggleClass('filtered-out', !nodeIds.has(n.id()));
					});
				cy.edges().forEach((e) => {
					e.toggleClass('filtered-out', !edgeIds.has(e.id()));
				});
			});
		},

		highlightNeighborhood(nodeId) {
			if (!alive()) return;
			highlightNeighborhood(cy, nodeId);
		},

		highlightPath(nodeIds) {
			if (!alive()) return;
			highlightPath(cy, nodeIds);
		},

		focus(nodeId) {
			if (!alive()) return;
			const node = cy.$id(nodeId);
			if (node.empty()) return;
			framing.focusOn(node);
		},

		positions() {
			if (!alive()) return new Map<string, Point>();
			const shown = cy
				.nodes()
				.filter((n) => !n.hasClass('filtered-out') && !n.hasClass(CAPTION_CLASS)) as NodeCollection;
			return new Map(shown.map((n) => [n.id(), { ...n.position() }] as const));
		},

		markCursor(nodeId) {
			if (!alive()) return;
			const node = markCursor(cy, nodeId);
			if (node) framing.bringIntoView(node);
		},

		screenChanged() {
			if (!alive()) return;
			framing.screenChanged();
		},

		setStylesheet(stylesheet) {
			if (!alive()) return;
			cy.style(stylesheet as unknown as Parameters<typeof cy.style>[0]);
		},

		destroy() {
			if (!alive()) return;
			motion.stopLayouts();
			// Animations need no stopping of their own — destroying the core halts the loop
			// that steps them and empties every queue.
			cy.destroy();
		}
	};
}

export async function createExplorer(opts: ExplorerOptions): Promise<ExplorerController> {
	const cytoscape = (await import('cytoscape')).default;

	// Built empty on purpose. The constructor arranges whatever it is handed, before there is
	// anywhere to register `layoutstart`, so giving it the elements would either hide that first
	// layout from the teardown or — when it is left out — have Cytoscape's default `grid` arrange
	// them, and the controller's cose would then start from a grid rather than from where the
	// constructor used to put them, moving the graph a household is used to. An empty graph has
	// nothing for the default layout to arrange, and the elements go in below at the same
	// starting positions the constructor gave them, for the controller's own layout to work from.
	const cy: Core = cytoscape({
		container: opts.container,
		style: opts.stylesheet as unknown as CytoscapeOptions['style'],
		minZoom: MIN_ZOOM,
		maxZoom: MAX_ZOOM,
		wheelSensitivity: 0.25,
		boxSelectionEnabled: false
	});
	cy.batch(() => cy.add(opts.elements as unknown as ElementDefinition[]));

	/*
	 * Cytoscape remembers where its container sits on the page and forgets it only on a scroll,
	 * a resize or the end of a transition. Content above the map can move it without any of
	 * those — a card unfolding, the server-drawn map giving way to this one — and every tap then
	 * lands where the node used to be: on its neighbour, or on nothing. Asking afresh before each
	 * pointer event costs one measurement per event and keeps a tap on what is under it.
	 */
	const renderer = (
		cy as unknown as { renderer(): { invalidateContainerClientCoordsCache(): void } }
	).renderer();
	const forgetWhereItWas = () => renderer.invalidateContainerClientCoordsCache();
	const listening = new AbortController();
	for (const type of POINTER_EVENTS) {
		opts.container.addEventListener(type, forgetWhereItWas, {
			capture: true,
			passive: true,
			signal: listening.signal
		});
	}

	const controller = explorerFromCore(cy, {
		...opts,
		pixelRatio:
			opts.pixelRatio ?? (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1)
	});
	return {
		...controller,
		destroy() {
			listening.abort();
			controller.destroy();
		}
	};
}

/** The events Cytoscape reads a pointer's page position from. */
const POINTER_EVENTS = ['mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'wheel'];
