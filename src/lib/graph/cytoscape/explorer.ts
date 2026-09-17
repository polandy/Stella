import type { Core, CytoscapeOptions, ElementDefinition, EventObject, Layouts } from 'cytoscape';
import type { CyElement } from './elements';
import type { CyStyle } from './stylesheet';

/*
 * Imperative Cytoscape controller — the one place the library is touched, and it is dynamically
 * imported so the ~400 KB engine only loads on the explorer route (docs/04 §4.11). It holds no
 * domain rules: callers pass in already-built elements/visibility (from the pure model
 * operations) and it renders, lays out, highlights, and reports taps back. Swapping renderers
 * would touch only this file.
 */

export interface ExplorerHandlers {
	onTapNode: (id: string) => void;
	onTapBackground: () => void;
}

/** What the controller needs beyond the core; the core already carries its own container. */
export interface ControllerOptions extends ExplorerHandlers {
	reducedMotion: boolean;
}

export interface ExplorerOptions extends ControllerOptions {
	container: HTMLElement;
	elements: CyElement[];
	stylesheet: CyStyle[];
}

export interface ExplorerController {
	/** Reconcile the full (expanded) element set; re-layouts only when nodes were added. */
	setGraph(elements: CyElement[]): void;
	/** Show only these node/edge ids (filtering), without a re-layout. */
	setVisible(nodeIds: Set<string>, edgeIds: Set<string>): void;
	/** Dim everything except the node and its immediate neighbourhood (null clears). */
	highlightNeighborhood(nodeId: string | null): void;
	/** Emphasise a connection path and dim the rest (null clears). */
	highlightPath(nodeIds: string[] | null): void;
	/** Smoothly centre and zoom onto a node. */
	focus(nodeId: string): void;
	/** Re-theme the canvas from a freshly-resolved palette. */
	setStylesheet(stylesheet: CyStyle[]): void;
	/** Tear the canvas down. Idempotent, and every other method no-ops afterwards. */
	destroy(): void;
}

/**
 * Written onto the container while a layout runs and when it has finished, so a caller can
 * tell a canvas that is still moving from one that has come to rest. The nodes travel for as
 * long as the animation lasts, and their drawn positions mean nothing until it stops.
 */
const LAYOUT_STATE_ATTRIBUTE = 'data-layout';
const SETTLING = 'settling';
const SETTLED = 'settled';

/** Cytoscape hands the layout instance along with its own lifecycle events. */
interface LayoutEvent extends EventObject {
	layout: Layouts;
}

function layout(reducedMotion: boolean) {
	return {
		name: 'cose',
		animate: !reducedMotion,
		randomize: false, // start from current positions so expansion stays gentle
		fit: true,
		padding: 48,
		nodeRepulsion: () => 8000,
		idealEdgeLength: () => 90,
		nodeDimensionsIncludeLabels: true
	};
}

/**
 * The controller over an existing core. Split from {@link createExplorer} so the lifecycle can
 * be exercised against a headless core: what matters here is not the drawing but that nothing
 * touches the core once it is gone.
 */
export function explorerFromCore(cy: Core, opts: ControllerOptions): ExplorerController {
	const container = cy.container();
	const setLayoutState = (state: string) => container?.setAttribute(LAYOUT_STATE_ATTRIBUTE, state);

	// Every layout still moving the nodes. Destroying the core does not stop a layout: its next
	// frame would run against a core whose renderer is already gone, throw there, and leave a
	// half-demolished canvas behind — which is what a page navigated away from mid-layout used
	// to do. There can be more than one, because expanding a node re-arranges the graph while
	// the opening arrangement is still travelling, and Cytoscape lets the two run side by side.
	const running = new Set<Layouts>();

	setLayoutState(SETTLING);
	cy.on('layoutstart', (e) => {
		running.add((e as LayoutEvent).layout);
		setLayoutState(SETTLING);
	});
	cy.on('layoutstop', (e) => {
		running.delete((e as LayoutEvent).layout);
		// Only the last one to finish has brought the canvas to rest; the nodes an earlier
		// layout left behind are still being moved by a later one.
		if (running.size === 0) setLayoutState(SETTLED);
	});

	cy.on('tap', 'node', (e) => opts.onTapNode(e.target.id()));
	cy.on('tap', (e) => {
		if (e.target === cy) opts.onTapBackground();
	});

	const duration = opts.reducedMotion ? 0 : 350;
	/** Nothing reaches a torn-down core: the calls still in flight at teardown fall away here. */
	const alive = () => !cy.destroyed();
	const relayout = () => cy.layout(layout(opts.reducedMotion) as Parameters<Core['layout']>[0]).run();

	// The first arrangement runs here rather than through the constructor's `layout` option,
	// which lays out before there is anywhere to register `layoutstart` — and so before the
	// running layout could be caught and stopped again.
	relayout();

	return {
		setGraph(elements) {
			if (!alive()) return;
			const incoming = new Set(elements.map((e) => e.data.id as string));
			let changed = false;
			cy.batch(() => {
				cy.elements().forEach((el) => {
					if (!incoming.has(el.id())) {
						el.remove();
						changed = true;
					}
				});
				const existing = new Set(cy.elements().map((el) => el.id()));
				const toAdd = elements.filter((e) => !existing.has(e.data.id as string));
				if (toAdd.length) {
					cy.add(toAdd as unknown as ElementDefinition[]);
					changed = true;
				}
			});
			// Only when the element set actually moved. The component pushes the same set again
			// on mount, and re-laying out for that threw every node across the canvas a second
			// time — a settled graph that jumps for no reason the viewer can see.
			if (changed) relayout();
		},

		setVisible(nodeIds, edgeIds) {
			if (!alive()) return;
			cy.batch(() => {
				cy.nodes().forEach((n) => {
					n.toggleClass('filtered-out', !nodeIds.has(n.id()));
				});
				cy.edges().forEach((e) => {
					e.toggleClass('filtered-out', !edgeIds.has(e.id()));
				});
			});
		},

		highlightNeighborhood(nodeId) {
			if (!alive()) return;
			cy.elements().removeClass('faded highlight selected onpath');
			if (!nodeId) return;
			const node = cy.$id(nodeId);
			if (node.empty()) return;
			const hood = node.closedNeighborhood();
			cy.elements().not(hood).addClass('faded');
			hood.edges().addClass('highlight');
			node.addClass('selected');
		},

		highlightPath(nodeIds) {
			if (!alive()) return;
			cy.elements().removeClass('faded highlight selected onpath');
			if (!nodeIds || nodeIds.length === 0) return;
			let path = cy.collection();
			for (let i = 0; i < nodeIds.length; i++) {
				const node = cy.$id(nodeIds[i]);
				path = path.union(node);
				if (i > 0) path = path.union(cy.$id(nodeIds[i - 1]).edgesWith(node));
			}
			cy.elements().not(path).addClass('faded');
			path.addClass('onpath');
		},

		focus(nodeId) {
			if (!alive()) return;
			const node = cy.$id(nodeId);
			if (node.empty()) return;
			cy.animate({ center: { eles: node }, zoom: 1.3 }, { duration });
		},

		setStylesheet(stylesheet) {
			if (!alive()) return;
			cy.style(stylesheet as unknown as Parameters<typeof cy.style>[0]);
		},

		destroy() {
			if (!alive()) return;
			// A snapshot: stopping a layout makes it announce itself out of the set.
			for (const layout of [...running]) layout.stop();
			running.clear();
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
		minZoom: 0.2,
		maxZoom: 2.5,
		wheelSensitivity: 0.25,
		boxSelectionEnabled: false
	});
	cy.batch(() => cy.add(opts.elements as unknown as ElementDefinition[]));

	return explorerFromCore(cy, opts);
}
