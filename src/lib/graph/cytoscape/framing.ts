import type { Core, NodeCollection, NodeSingular } from 'cytoscape';
import { boxAround, frameAround } from '../layout/group-blocks';
import { boxAroundPoints, unionBox, withinScreen } from '../layout/boxes';
import { legibleZoom } from '../layout/legibility';
import { FOLLOWING, followView, type ViewEvent } from '../view-follow';
import { frameLegibly, widenToReveal, type Viewport } from './viewport';
import { peopleOn, sizeOf } from './canvas-nodes';
import type { Motion } from './motion';
import type { Point } from './placement';

/*
 * Where the view stands: framing the map below the toolbar and clear of a panel, stepping back to
 * show newcomers, following a node the keyboard or a search went to, and framing afresh after a
 * full-screen change unless the reader has taken the view over (docs/05 §5.8).
 */

/** The margin kept around the map, in screen pixels, when it is framed or widened. */
const FRAME_PADDING = 48;

export interface FramingOptions {
	/** Screen pixels the toolbar covers at the top, from the start. */
	topInset: number;
	/** The screen's device pixels per CSS pixel, which decides how far out names are still drawn. */
	pixelRatio: number;
	/** How long the view takes to step back or follow a node, in milliseconds; 0 jumps. */
	duration: number;
}

export interface Framing {
	/**
	 * The view that frames the map with everyone at `placeOf` — and, with `focusIds` (the family
	 * tree), never so far out that the names vanish. Remembered for a later reframe. Null when
	 * there is nobody shown or no canvas to frame them on.
	 */
	frame(
		placeOf: (node: NodeSingular) => Point,
		focusIds: ReadonlySet<string> | undefined
	): Viewport | null;
	/** The map has just framed itself: the view is its own again. */
	framed(): void;
	/** Steps the view back just far enough to take in `targets`, `margin` around each. */
	reveal(targets: Point[], margin: number): void;
	/** Brings `node` into view, only if it stands off screen or under the toolbar. */
	bringIntoView(node: NodeSingular): void;
	/** Centres and zooms onto `node`, as the reader asked. */
	focusOn(node: NodeSingular): void;
	/** Full screen was entered or left. */
	screenChanged(): void;
	setTopInset(pixels: number): void;
	setCovered(covered: { right: number; bottom: number }): void;
}

export function frameOn(cy: Core, motion: Motion, opts: FramingOptions): Framing {
	const { duration } = opts;
	// Screen pixels at the top of the canvas the toolbar floats over; framing leaves them free.
	let topInset = opts.topInset;
	// Screen pixels a panel covers at the right or along the foot; framing leaves them free.
	let covered = { right: 0, bottom: 0 };
	// Whether the view is still the map's own framing, and a reframe a full-screen change asked
	// for (`view-follow.ts`); the canvas only reports what happened and does what it says.
	let viewFollow = FOLLOWING;
	// The family the last framing kept first, so a reframe frames the tree the same way.
	let framedFocus: ReadonlySet<string> | undefined;

	const size = () => ({ width: cy.width(), height: cy.height() });
	const follow = (event: ViewEvent) => {
		const next = followView(viewFollow, event);
		viewFollow = next.state;
		if (next.reframe) reframe();
	};

	const viewFor = (
		placeOf: (node: NodeSingular) => Point,
		focusIds: ReadonlySet<string> | undefined
	) => {
		const shown = peopleOn(cy).filter((n) => !n.hasClass('filtered-out')) as NodeCollection;
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
		return shown.nonempty() && cy.width() > 0 && cy.height() > 0
			? frameLegibly(
					[boxOf(shown), ...frames].reduce(unionBox),
					focus,
					size(),
					{ top: topInset, ...covered },
					FRAME_PADDING,
					{
						min: cy.minZoom(),
						max: cy.maxZoom(),
						// The family tree keeps its names drawn; Free and By circle frame as before.
						legible: focus ? legibleZoom(opts.pixelRatio) : 0
					}
				)
			: null;
	};

	/*
	 * Frames the map afresh where everyone stands now, keeping the family first as the last
	 * framing did (docs/05 §5.8). At once: the canvas has just jumped to its new size, and a
	 * glide would only replay that jump. While the canvas still moves, the glide under way is
	 * aiming at the old size, so the reframe waits until it has come to rest.
	 */
	const reframe = () =>
		motion.afterSettling(() => {
			// The reader may have taken the view over while the canvas was coming to rest.
			if (viewFollow.navigated) return;
			const view = viewFor((node) => ({ ...node.position() }), framedFocus);
			if (!view) return;
			follow({ kind: 'framed', size: size() });
			cy.viewport(view);
		});

	// Only the reader's own gestures raise these — never `cy.viewport`, `cy.animate` or a
	// layout — so the map's framing and its glides are not mistaken for the reader moving it.
	cy.on('dragpan pinchzoom scrollzoom', () => follow({ kind: 'navigated' }));
	// Raised once the container has been measured afresh: Cytoscape watches its size itself.
	cy.on('resize', () => follow({ kind: 'resized', size: size() }));

	return {
		frame(placeOf, focusIds) {
			framedFocus = focusIds;
			return viewFor(placeOf, focusIds);
		},

		framed() {
			follow({ kind: 'framed', size: size() });
		},

		/*
		 * Newcomers set down beside a node at the edge of the view can land off screen. Rather
		 * than re-framing the map, the view steps back just far enough to take them in as well.
		 */
		reveal(targets, margin) {
			if (targets.length === 0 || cy.width() === 0 || cy.height() === 0) return;
			// The strip under the toolbar does not count as in view.
			const extent = cy.extent();
			const next = widenToReveal(
				{ extent: { ...extent, y1: extent.y1 + topInset / cy.zoom() }, zoom: cy.zoom() },
				boxAroundPoints(targets, margin),
				{ width: cy.width(), height: cy.height() - topInset },
				FRAME_PADDING,
				cy.minZoom()
			);
			if (!next) return;
			const view = { zoom: next.zoom, pan: { x: next.pan.x, y: next.pan.y + topInset } };
			motion.whileMoving((complete) => cy.animate(view, { duration, complete }));
		},

		bringIntoView(node) {
			if (cy.width() === 0 || cy.height() === 0) return;
			// The keyboard can step to someone the view has left behind; the view follows,
			// but only when it has to, so walking a map in view never moves it.
			if (withinScreen(node.renderedBoundingBox({ includeLabels: true }), size(), topInset)) return;
			// The keyboard moved the view, so it counts as the reader's own, as a drag would.
			follow({ kind: 'navigated' });
			motion.whileMoving((complete) =>
				cy.animate({ center: { eles: node } }, { duration, complete })
			);
		},

		focusOn(node) {
			// The reader asked to see this person: the view is theirs now, as after a pan.
			follow({ kind: 'navigated' });
			cy.animate({ center: { eles: node }, zoom: 1.3 }, { duration });
		},

		screenChanged() {
			// The size Cytoscape last measured: it measures afresh, and says `resize`, only once
			// the container has settled at its new one.
			follow({ kind: 'screenChanged', size: size() });
		},

		setTopInset(pixels) {
			topInset = pixels;
		},

		setCovered(next) {
			covered = next;
		}
	};
}
