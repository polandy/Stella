import type {
	Core,
	CytoscapeOptions,
	ElementDefinition,
	EventObject,
	Layouts,
	NodeSingular
} from 'cytoscape';
import type { CyElement } from './elements';
import type { Arrangement, Size } from '../layout/geometry';
import { placeNewcomers, type Placement, type Point } from './placement';
import { widenToReveal } from './viewport';
import { BOW_FIELD, BOWED_CLASS, type CyStyle } from './stylesheet';

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
	/**
	 * Reconcile the full (expanded) element set. Nodes already on the canvas stay where they
	 * are; only the newcomers are placed, clear of everyone, and the view is left alone
	 * unless it has to step back to show them.
	 */
	setGraph(elements: CyElement[]): void;
	/** Arrange the whole map afresh by the forces between people, and frame it. */
	arrange(): void;
	/**
	 * Glide the map into an arrangement worked out elsewhere (the family tree, the groups by
	 * circle) and frame it. A node without a place in it stays where it is; the lines it says
	 * to bend go around whoever stands in their way, and every other line is drawn straight.
	 */
	arrangeAt(arrangement: Arrangement): void;
	/** How much room a node takes on the canvas, its name included, in model units. */
	sizeOf(nodeId: string): Size;
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

/** The margin kept around the map, in screen pixels, when it is framed or widened. */
const FRAME_PADDING = 48;
/** The furthest out the canvas zooms, whether by the reader or to reveal newcomers. */
const MIN_ZOOM = 0.2;

/** The length the force layout aims every edge at, and the step newcomers are placed at. */
const EDGE_LENGTH = 90;
/**
 * How long a tidy-up takes to glide the map into its new arrangement, in milliseconds. Slow
 * enough to follow each person to their new place, which is what keeps the reader oriented.
 */
const TIDY_GLIDE_DURATION = 1200;

function layout(reducedMotion: boolean) {
	return {
		name: 'cose',
		animate: !reducedMotion,
		randomize: false, // start from current positions
		fit: true,
		padding: FRAME_PADDING,
		nodeRepulsion: () => 8000,
		idealEdgeLength: () => EDGE_LENGTH,
		nodeDimensionsIncludeLabels: true
	};
}

/**
 * The full arrangement, computed first and then glided into in one movement — the view framing
 * along with it — rather than showing every step of the simulation. Under reduced motion the
 * map simply takes its new shape.
 */
function tidyLayout(reducedMotion: boolean) {
	return {
		...layout(reducedMotion),
		animate: reducedMotion ? false : ('end' as const),
		animationDuration: TIDY_GLIDE_DURATION,
		animationEasing: 'ease-in-out-cubic'
	};
}

/** Moving every node to a place already worked out, with the same glide as a tidy-up. */
function presetLayout(reducedMotion: boolean, placeOf: (node: NodeSingular) => Point) {
	return {
		name: 'preset',
		positions: placeOf,
		animate: !reducedMotion,
		animationDuration: TIDY_GLIDE_DURATION,
		animationEasing: 'ease-in-out-cubic',
		fit: true,
		padding: FRAME_PADDING
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
	// to do. There can be more than one, because tidying the map up re-arranges it while the
	// opening arrangement may still be travelling, and Cytoscape lets the two run side by side.
	const running = new Set<Layouts>();
	// Animations still under way from an expand — newcomers travelling out to their places, the
	// view stepping back to show them. Until they end the drawn positions are still moving,
	// just as during a layout.
	let moving = 0;
	// Only the last layout to finish, with nothing else moving, has brought the canvas to rest;
	// the nodes an earlier layout left behind are still being moved by a later one.
	const publishLayoutState = () =>
		setLayoutState(running.size === 0 && moving === 0 ? SETTLED : SETTLING);
	/** Runs an animation that counts as the canvas moving until it completes. */
	const whileMoving = (start: (complete: () => void) => void) => {
		moving++;
		publishLayoutState();
		start(() => {
			moving--;
			publishLayoutState();
		});
	};

	setLayoutState(SETTLING);
	cy.on('layoutstart', (e) => {
		running.add((e as LayoutEvent).layout);
		publishLayoutState();
	});
	cy.on('layoutstop', (e) => {
		running.delete((e as LayoutEvent).layout);
		publishLayoutState();
	});

	cy.on('tap', 'node', (e) => opts.onTapNode(e.target.id()));
	cy.on('tap', (e) => {
		if (e.target === cy) opts.onTapBackground();
	});

	const duration = opts.reducedMotion ? 0 : 350;
	/** Nothing reaches a torn-down core: the calls still in flight at teardown fall away here. */
	const alive = () => !cy.destroyed();
	const relayout = () =>
		cy.layout(layout(opts.reducedMotion) as Parameters<Core['layout']>[0]).run();

	/*
	 * Newcomers travel out from the person they were opened from to their places, which the
	 * placement already chose clear of everyone else — no layout runs, so nobody else moves.
	 * Under reduced motion they are simply there.
	 */
	const bringIn = (placements: Map<string, Placement>) => {
		reveal([...placements.values()].map((p) => p.at));
		if (duration === 0) return;
		for (const [id, { at }] of placements) {
			whileMoving((complete) => cy.$id(id).animate({ position: at }, { duration, complete }));
		}
	};

	/*
	 * Newcomers set down beside a node at the edge of the view can land off screen. Rather
	 * than re-framing the map, the view steps back just far enough to take them in as well.
	 */
	const reveal = (targets: Point[]) => {
		if (targets.length === 0 || cy.width() === 0 || cy.height() === 0) return;
		// Half an edge length around each centre covers the node and the name drawn under it.
		const margin = EDGE_LENGTH / 2;
		const next = widenToReveal(
			{ extent: cy.extent(), zoom: cy.zoom() },
			{
				x1: Math.min(...targets.map((p) => p.x)) - margin,
				y1: Math.min(...targets.map((p) => p.y)) - margin,
				x2: Math.max(...targets.map((p) => p.x)) + margin,
				y2: Math.max(...targets.map((p) => p.y)) + margin
			},
			{ width: cy.width(), height: cy.height() },
			FRAME_PADDING,
			cy.minZoom()
		);
		if (!next) return;
		whileMoving((complete) => cy.animate(next, { duration, complete }));
	};

	/** Bends exactly the lines in `bows`, and straightens every other. */
	const bend = (bows: ReadonlyMap<string, number>) => {
		cy.batch(() => {
			cy.edges().forEach((edge) => {
				const bow = bows.get(edge.id());
				if (bow === undefined) {
					edge.removeClass(BOWED_CLASS);
				} else {
					edge.data(BOW_FIELD, bow);
					edge.addClass(BOWED_CLASS);
				}
			});
		});
	};

	// The first arrangement runs here rather than through the constructor's `layout` option,
	// which lays out before there is anywhere to register `layoutstart` — and so before the
	// running layout could be caught and stopped again.
	relayout();

	return {
		setGraph(elements) {
			if (!alive()) return;
			const incoming = new Set(elements.map((e) => e.data.id as string));
			const newcomers = new Set<string>();
			let placements = new Map<string, Placement>();
			let wasEmpty = false;
			cy.batch(() => {
				cy.elements().forEach((el) => {
					if (!incoming.has(el.id())) el.remove();
				});
				wasEmpty = cy.nodes().empty();
				const placed = new Map<string, Point>(
					cy.nodes().map((n) => [n.id(), { ...n.position() }] as const)
				);
				const existing = new Set(cy.elements().map((el) => el.id()));
				const toAdd = elements.filter((e) => !existing.has(e.data.id as string));
				if (toAdd.length === 0) return;
				for (const e of toAdd) if (e.group === 'nodes') newcomers.add(e.data.id as string);
				const links = elements
					.filter((e) => e.group === 'edges')
					.map((e) => ({ source: e.data.source as string, target: e.data.target as string }));
				placements = placeNewcomers(placed, [...newcomers], links, EDGE_LENGTH);
				// With motion, a newcomer starts on the person it was opened from and travels out.
				const startAt = (p: Placement) => (duration === 0 ? p.at : p.from);
				cy.add(
					toAdd.map((e) => {
						const placement = placements.get(e.data.id as string);
						return placement ? { ...e, position: { ...startAt(placement) } } : e;
					}) as unknown as ElementDefinition[]
				);
			});
			// Nobody is moved for a removal, nor when the component pushes the same set again on
			// mount — a settled graph that jumps for no reason the viewer can see. An expand moves
			// only the people it brought in (docs/05 §5.8); a canvas that was empty has nothing
			// to keep, and gets a full arrangement.
			if (newcomers.size === 0) return;
			if (wasEmpty) relayout();
			else bringIn(placements);
		},

		arrange() {
			if (!alive()) return;
			bend(new Map());
			cy.layout(tidyLayout(opts.reducedMotion) as Parameters<Core['layout']>[0]).run();
		},

		arrangeAt({ positions, bows }) {
			if (!alive()) return;
			bend(bows);
			const placeOf = (node: NodeSingular) => positions.get(node.id()) ?? { ...node.position() };
			cy.layout(presetLayout(opts.reducedMotion, placeOf) as Parameters<Core['layout']>[0]).run();
		},

		sizeOf(nodeId) {
			const node = cy.$id(nodeId);
			if (!alive() || node.empty()) return { width: 0, height: 0 };
			const box = node.boundingBox({ includeLabels: true });
			return { width: box.w, height: box.h };
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
		minZoom: MIN_ZOOM,
		maxZoom: 2.5,
		wheelSensitivity: 0.25,
		boxSelectionEnabled: false
	});
	cy.batch(() => cy.add(opts.elements as unknown as ElementDefinition[]));

	return explorerFromCore(cy, opts);
}
