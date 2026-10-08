import type {
	Core,
	CytoscapeOptions,
	ElementDefinition,
	EdgeSingular,
	EventObject,
	Layouts,
	NodeCollection,
	NodeSingular
} from 'cytoscape';
import type { CyElement } from './elements';
import { spreadCoincident, type Arrangement, type Size } from '../layout/geometry';
import { boxAround, frameAround, packGroups } from '../layout/group-blocks';
import { placeNewcomers, type Placement, type Point } from './placement';
import { frameLegibly, widenToReveal, type Box } from './viewport';
import { legibleZoom } from '../layout/legibility';
import { DEFAULT_DENSITY, spacingFor, type Spacing } from '../layout/density';
import { bendLines, CAPTION_ID, writeCaption, type Captions } from './tree-canvas';
import {
	CAPTION_CLASS,
	CURSOR_CLASS,
	HAS_MORE_CLASS,
	HOVERED_CLASS,
	TUCKED_CLASS,
	type CyStyle
} from './stylesheet';

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

/** What a group's frame carries as its kind (`elements.ts`). */
const FRAME_KIND = 'group';
const isFrame = (e: CyElement) => e.group === 'nodes' && e.data.kind === FRAME_KIND;

/** The margin kept around the map, in screen pixels, when it is framed or widened. */
const FRAME_PADDING = 48;
/** The furthest out the canvas zooms, whether by the reader or to reveal newcomers. */
const MIN_ZOOM = 0.2;

/** The classes the elements decide, which an element already on the canvas takes on afresh. */
const SYNCED_CLASSES = [TUCKED_CLASS, HAS_MORE_CLASS];

/** A line a bundle stands for is aimed this many edge lengths long. */
const TUCKED_EDGE_FACTOR = 2;
/**
 * How long a tidy-up takes to glide the map into its new arrangement, in milliseconds. Slow
 * enough to follow each person to their new place, which is what keeps the reader oriented.
 */
const TIDY_GLIDE_DURATION = 1200;
/** The glide eases in and out, so a node sets off and arrives gently. */
const GLIDE_EASING = 'ease-in-out-cubic';
/** The closest the canvas zooms, whether by the reader or when framing a small map. */
const MAX_ZOOM = 2.5;

/**
 * The force-directed arrangement at the reader's density, worked out in one go rather than
 * shown step by step: its result is then glided into like any other arrangement, framed by the
 * controller itself so the framing can leave the toolbar's strip free.
 */
function forceLayout({ edgeLength, repulsion }: Spacing) {
	return {
		name: 'cose',
		animate: false,
		randomize: false, // start from current positions
		fit: false,
		nodeRepulsion: () => repulsion,
		// A line a bundle stands for still ties its member to the map, but at a longer reach, so
		// the block its group is packed into stands clear of the circle (docs/02 §2.7).
		idealEdgeLength: (edge: EdgeSingular) =>
			edge.hasClass(TUCKED_CLASS) ? TUCKED_EDGE_FACTOR * edgeLength : edgeLength,
		nodeDimensionsIncludeLabels: true
	};
}

/** Moving every node to a place already worked out; the controller frames the view itself. */
function presetLayout(glide: boolean, placeOf: (node: NodeSingular) => Point) {
	return {
		name: 'preset',
		positions: placeOf,
		animate: glide,
		animationDuration: TIDY_GLIDE_DURATION,
		animationEasing: GLIDE_EASING,
		fit: false
	};
}

/** The box around both. */
function union(a: Box, b: Box): Box {
	return {
		x1: Math.min(a.x1, b.x1),
		y1: Math.min(a.y1, b.y1),
		x2: Math.max(a.x2, b.x2),
		y2: Math.max(a.y2, b.y2)
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

	// Pointing at a line, or at a person, names those lines (docs/05 §5.8): with the names of a
	// busy map switched off, this is how one is read without selecting anybody.
	const linesUnder = (e: EventObject) => (e.target.isNode() ? e.target.connectedEdges() : e.target);
	cy.on('mouseover', 'node, edge', (e) => linesUnder(e).addClass(HOVERED_CLASS));
	cy.on('mouseout', 'node, edge', (e) => linesUnder(e).removeClass(HOVERED_CLASS));

	const duration = opts.reducedMotion ? 0 : 350;
	/**
	 * Everything on the canvas but the frames of the groups by role: a frame stands wherever its
	 * members do, so it is never placed, measured or put back by itself.
	 */
	const people = () =>
		cy
			.nodes()
			.filter((n) => n.data('kind') !== FRAME_KIND && !n.hasClass(CAPTION_CLASS)) as NodeCollection;
	/** Nothing reaches a torn-down core: the calls still in flight at teardown fall away here. */
	const alive = () => !cy.destroyed();
	// Screen pixels at the top of the canvas the toolbar floats over; framing leaves them free.
	let topInset = opts.topInset ?? 0;
	// Screen pixels a panel covers at the right or along the foot; framing leaves them free.
	let covered = { right: 0, bottom: 0 };
	// How far apart people are set: the reader's density (docs/05 §5.8).
	let spacing = opts.spacing ?? spacingFor(DEFAULT_DENSITY);

	/*
	 * Where the force layout would put everyone, without moving anyone yet: it runs in one go
	 * (no animation), its answer is read off, and every node is put back — so the move there
	 * can be a single glide, framed below the toolbar, like every other arrangement.
	 */
	const forcePositions = (): Map<string, Point> => {
		const before = new Map(cy.nodes().map((n) => [n.id(), { ...n.position() }] as const));
		// People on one spot — everyone, on a first load — would be pushed apart at random.
		const start = spreadCoincident(
			new Map(people().map((n) => [n.id(), { ...n.position() }] as const)),
			spacing.edgeLength
		);
		cy.batch(() => people().forEach((n) => void n.position(start.get(n.id())!)));
		cy.layout(forceLayout(spacing) as Parameters<Core['layout']>[0]).run();
		// Frames left out: one stands wherever its members do, and is no one to step out of it.
		const after = new Map(people().map((n) => [n.id(), { ...n.position() }] as const));
		cy.batch(() => people().forEach((n) => void n.position(before.get(n.id())!)));
		// The forces spread a group's members as they would anybody; a group stands as one block
		// where they came to rest (docs/02 §2.7).
		const groups = cy
			.nodes()
			.filter((n) => n.isParent())
			.map((frame) => (frame as NodeSingular).children().map((n) => n.id()));
		return packGroups(after, groups, (id) => sizeOf(cy.$id(id)));
	};

	/*
	 * Moves the map to `positions` and frames it below the toolbar — gliding both together, or
	 * at once under reduced motion or when there is nothing yet to glide from. A node without a
	 * place stays where it is; a filtered-out node is left out of the frame.
	 */
	const glideTo = (
		positions: ReadonlyMap<string, Point>,
		glide: boolean,
		focusIds?: ReadonlySet<string>
	) => {
		const placeOf = (node: NodeSingular) => positions.get(node.id()) ?? { ...node.position() };
		const shown = people().filter((n) => !n.hasClass('filtered-out')) as NodeCollection;
		const boxOf = (nodes: NodeCollection) =>
			boxAround(nodes.map((n) => ({ at: placeOf(n), size: sizeOf(n) })));
		// A group's frame reaches past its members, its name above them (docs/02 §2.7).
		const frames = shown
			.parents()
			.map((frame) => frameAround(boxOf(frame.children().intersection(shown) as NodeCollection)));
		// Should all of it fit only so far out that the names vanish, the family comes first.
		const focused = focusIds ? (shown.filter((n) => focusIds.has(n.id())) as NodeCollection) : null;
		const centre = focused?.filter('.center');
		const focus =
			focused && focused.nonempty()
				? {
						box: boxOf(focused),
						...(centre && centre.nonempty()
							? { point: placeOf(centre.first() as NodeSingular) }
							: {})
					}
				: null;
		const view =
			shown.nonempty() && cy.width() > 0 && cy.height() > 0
				? frameLegibly(
						[boxOf(shown), ...frames].reduce(union),
						focus,
						{ width: cy.width(), height: cy.height() },
						{ top: topInset, ...covered },
						FRAME_PADDING,
						{
							min: cy.minZoom(),
							max: cy.maxZoom(),
							// The family tree keeps its names drawn; Free and By circle frame as before.
							legible: focus ? legibleZoom(opts.pixelRatio ?? 1) : 0
						}
					)
				: null;
		cy.layout(presetLayout(glide, placeOf) as Parameters<Core['layout']>[0]).run();
		if (!view) return;
		if (!glide) {
			cy.viewport(view);
			return;
		}
		whileMoving((complete) =>
			cy.animate(view, { duration: TIDY_GLIDE_DURATION, easing: GLIDE_EASING, complete })
		);
	};

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
		const margin = spacing.edgeLength / 2;
		// The strip under the toolbar does not count as in view.
		const extent = cy.extent();
		const next = widenToReveal(
			{ extent: { ...extent, y1: extent.y1 + topInset / cy.zoom() }, zoom: cy.zoom() },
			{
				x1: Math.min(...targets.map((p) => p.x)) - margin,
				y1: Math.min(...targets.map((p) => p.y)) - margin,
				x2: Math.max(...targets.map((p) => p.x)) + margin,
				y2: Math.max(...targets.map((p) => p.y)) + margin
			},
			{ width: cy.width(), height: cy.height() - topInset },
			FRAME_PADDING,
			cy.minZoom()
		);
		if (!next) return;
		const view = { zoom: next.zoom, pan: { x: next.pan.x, y: next.pan.y + topInset } };
		whileMoving((complete) => cy.animate(view, { duration, complete }));
	};

	/** How much room a node takes, its name included, in model units. */
	const sizeOf = (node: NodeSingular): Size => {
		const box = node.boundingBox({ includeLabels: true });
		return { width: box.w, height: box.h };
	};

	// The first arrangement runs here rather than through the constructor's `layout` option,
	// which lays out before there is anywhere to register `layoutstart` — and so before the
	// running layout could be caught and stopped again. It is simply there: the map has no
	// earlier shape for a glide to start from.
	glideTo(forcePositions(), false);

	return {
		setGraph(elements, { arrangedNext = false } = {}) {
			if (!alive()) return;
			const incoming = new Map(elements.map((e) => [e.data.id as string, e] as const));
			const newcomers = new Set<string>();
			let placements = new Map<string, Placement>();
			let wasEmpty = false;
			cy.batch(() => {
				// A frame goes in before anybody can be moved into it, and people leave a frame
				// before it goes: removing a compound node takes everyone still inside with it.
				cy.add(
					elements.filter(
						(e) => isFrame(e) && cy.$id(e.data.id as string).empty()
					) as unknown as ElementDefinition[]
				);
				cy.nodes().forEach((n) => {
					const wanted = incoming.get(n.id());
					if (!wanted || isFrame(wanted)) return;
					const parent = (wanted.data.parent as string | undefined) ?? null;
					const current = n.parent().nonempty() ? n.parent().first().id() : null;
					if (parent !== current) n.move({ parent });
				});
				cy.elements().forEach((el) => {
					const wanted = incoming.get(el.id());
					if (!wanted) {
						// The caption is the controller's own, never one of the elements.
						if (el.id() !== CAPTION_ID) el.remove();
						return;
					}
					// Switching the grouping keeps most elements, but tucks lines away or brings
					// them back, and recounts a group; an expand takes the "+N" off whoever has
					// nothing more behind them. Only what the elements own is synced: the
					// highlight, filter and bend classes belong to the controller.
					const owned = wanted.classes.split(' ');
					for (const name of SYNCED_CLASSES) el.toggleClass(name, owned.includes(name));
					const { id: _id, source: _s, target: _t, parent: _p, ...data } = wanted.data;
					el.data(data);
				});
				wasEmpty = people().empty();
				const placed = new Map<string, Point>(
					people().map((n) => [n.id(), { ...n.position() }] as const)
				);
				const existing = new Set(cy.elements().map((el) => el.id()));
				const toAdd = elements.filter((e) => !existing.has(e.data.id as string));
				if (toAdd.length === 0) return;
				for (const e of toAdd) if (e.group === 'nodes') newcomers.add(e.data.id as string);
				const links = elements
					.filter((e) => e.group === 'edges')
					.map((e) => ({ source: e.data.source as string, target: e.data.target as string }));
				placements = placeNewcomers(placed, [...newcomers], links, spacing.edgeLength);
				// With motion, a newcomer starts on the person it was opened from and travels out.
				const startAt = (p: Placement) => (duration === 0 && !arrangedNext ? p.at : p.from);
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
			if (wasEmpty) glideTo(forcePositions(), false);
			else if (!arrangedNext) bringIn(placements);
		},

		arrange() {
			if (!alive()) return;
			writeCaption(cy, undefined, undefined);
			bendLines(cy, { bows: new Map() }, (node) => node.position());
			glideTo(forcePositions(), !opts.reducedMotion);
		},

		arrangeAt({ positions, bows, routes, outsideFamily }, captions = {}) {
			if (!alive()) return;
			bendLines(cy, { bows, routes }, (node) => positions.get(node.id()) ?? node.position());
			const captioned = writeCaption(cy, outsideFamily, captions.outsideFamily);
			// The family is what is framed first, should all of it not fit with its names drawn.
			const family = captions.keepNamesDrawn
				? new Set(
						[...positions]
							.filter(([, at]) => !outsideFamily || at.y < outsideFamily.y)
							.map(([id]) => id)
					)
				: undefined;
			glideTo(new Map([...positions, ...captioned]), !opts.reducedMotion, family);
		},

		sizeOf(nodeId) {
			const node = cy.$id(nodeId);
			if (!alive() || node.empty()) return { width: 0, height: 0 };
			return sizeOf(node);
		},

		setTopInset(pixels) {
			topInset = pixels;
		},

		setCovered(next) {
			covered = next;
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
			cy.elements().removeClass('faded highlight selected onpath');
			if (!nodeId) return;
			const node = cy.$id(nodeId);
			if (node.empty()) return;
			// A group lights up with its members and everything they are tied to; anybody lit keeps
			// the frame they stand in lit too, since a frame's fading would fade them with it.
			const own = node.union(node.children());
			let hood = own.closedNeighborhood();
			hood = hood.union(hood.nodes().parents());
			cy.elements().not(hood).addClass('faded');
			// A tucked-away line shows for the member it belongs to, not for whoever is at its
			// other end: selecting the circle keeps the one line to each group. Nor does it show
			// for a selected group where the group's own bundle already reaches that other end.
			const grouped = own.nodes().filter((n) => n.isChild());
			const bundledTo = node.isParent() ? node.neighborhood().nodes() : cy.collection();
			const shows = (e: EdgeSingular) =>
				!e.hasClass(TUCKED_CLASS) ||
				(e.connectedNodes().intersection(grouped).nonempty() &&
					e.connectedNodes().intersection(bundledTo).empty());
			hood.edges().filter(shows).addClass('highlight');
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
			cy.elements().not(path.union(path.nodes().parents())).addClass('faded');
			path.addClass('onpath');
		},

		focus(nodeId) {
			if (!alive()) return;
			const node = cy.$id(nodeId);
			if (node.empty()) return;
			cy.animate({ center: { eles: node }, zoom: 1.3 }, { duration });
		},

		positions() {
			if (!alive()) return new Map();
			const shown = cy
				.nodes()
				.filter((n) => !n.hasClass('filtered-out') && !n.hasClass(CAPTION_CLASS)) as NodeCollection;
			return new Map(shown.map((n) => [n.id(), { ...n.position() }] as const));
		},

		markCursor(nodeId) {
			if (!alive()) return;
			cy.nodes().removeClass(CURSOR_CLASS);
			if (!nodeId) return;
			const node = cy.$id(nodeId);
			if (node.empty()) return;
			node.addClass(CURSOR_CLASS);
			if (cy.width() === 0 || cy.height() === 0) return;
			// The keyboard can step to someone the view has left behind; the view follows,
			// but only when it has to, so walking a map in view never moves it.
			const box = node.renderedBoundingBox({ includeLabels: true });
			const inView =
				box.x1 >= 0 && box.x2 <= cy.width() && box.y1 >= topInset && box.y2 <= cy.height();
			if (inView) return;
			whileMoving((complete) => cy.animate({ center: { eles: node } }, { duration, complete }));
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
