import type { Core, EdgeSingular, NodeSingular } from 'cytoscape';
import { spreadCoincident } from '../layout/geometry';
import type { Spacing } from '../layout/density';
import { packGroups } from '../layout/group-blocks';
import { peopleOn, sizeOf } from './canvas-nodes';
import type { Framing } from './framing';
import type { Motion } from './motion';
import type { Placement, Point } from './placement';
import { TUCKED_CLASS } from './stylesheet';

/*
 * Moving people: every arrangement is worked out first and then glided into, the view travelling
 * with it; an expand's newcomers travel out on their own while nobody else moves (docs/04 §4.11,
 * docs/05 §5.8).
 */

/** A line a bundle stands for is aimed this many edge lengths long. */
const TUCKED_EDGE_FACTOR = 2;
/**
 * How long a tidy-up takes to glide the map into its new arrangement, in milliseconds. Slow
 * enough to follow each person to their new place, which is what keeps the reader oriented.
 */
const TIDY_GLIDE_DURATION = 1200;
/** The glide eases in and out, so a node sets off and arrives gently. */
const GLIDE_EASING = 'ease-in-out-cubic';

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

export interface ArrangingDeps {
	motion: Motion;
	framing: Framing;
	/** How far apart people are set right now: the reader's density. */
	spacing: () => Spacing;
	/** How long newcomers take to travel out, in milliseconds; 0 sets them down at once. */
	duration: number;
}

export interface Arranging {
	/** Where the force layout would put everyone, without moving anyone yet. */
	forcePositions(): Map<string, Point>;
	/**
	 * Moves the map to `positions` and frames it below the toolbar — gliding both together, or
	 * at once. With `focusIds` the framing keeps them first.
	 */
	glideTo(
		positions: ReadonlyMap<string, Point>,
		glide: boolean,
		focusIds?: ReadonlySet<string>
	): void;
	/** Newcomers travel out from the person they were opened from to their places. */
	bringIn(placements: Map<string, Placement>): void;
}

export function arrangeOn(
	cy: Core,
	{ motion, framing, spacing, duration }: ArrangingDeps
): Arranging {
	return {
		/*
		 * The force layout runs in one go (no animation), its answer is read off, and every node
		 * is put back — so the move there can be a single glide, framed below the toolbar, like
		 * every other arrangement.
		 */
		forcePositions() {
			const before = new Map(cy.nodes().map((n) => [n.id(), { ...n.position() }] as const));
			// People on one spot — everyone, on a first load — would be pushed apart at random.
			const start = spreadCoincident(
				new Map(peopleOn(cy).map((n) => [n.id(), { ...n.position() }] as const)),
				spacing().edgeLength
			);
			cy.batch(() => peopleOn(cy).forEach((n) => void n.position(start.get(n.id())!)));
			cy.layout(forceLayout(spacing()) as Parameters<Core['layout']>[0]).run();
			// Frames left out: one stands wherever its members do, and is no one to step out of it.
			const after = new Map(peopleOn(cy).map((n) => [n.id(), { ...n.position() }] as const));
			cy.batch(() => peopleOn(cy).forEach((n) => void n.position(before.get(n.id())!)));
			// The forces spread a group's members as they would anybody; a group stands as one block
			// where they came to rest (docs/02 §2.7).
			const groups = cy
				.nodes()
				.filter((n) => n.isParent())
				.map((frame) => (frame as NodeSingular).children().map((n) => n.id()));
			return packGroups(after, groups, (id) => sizeOf(cy.$id(id)));
		},

		/*
		 * At once under reduced motion or when there is nothing yet to glide from. A node without a
		 * place stays where it is; a filtered-out node is left out of the frame.
		 */
		glideTo(positions, glide, focusIds) {
			const placeOf = (node: NodeSingular) => positions.get(node.id()) ?? { ...node.position() };
			const view = framing.frame(placeOf, focusIds);
			cy.layout(presetLayout(glide, placeOf) as Parameters<Core['layout']>[0]).run();
			if (!view) return;
			framing.framed();
			if (!glide) {
				cy.viewport(view);
				return;
			}
			motion.whileMoving((complete) =>
				cy.animate(view, { duration: TIDY_GLIDE_DURATION, easing: GLIDE_EASING, complete })
			);
		},

		/*
		 * The placement already chose their places clear of everyone else — no layout runs, so
		 * nobody else moves. Under reduced motion they are simply there.
		 */
		bringIn(placements) {
			// Half an edge length around each centre covers the node and the name drawn under it.
			framing.reveal(
				[...placements.values()].map((p) => p.at),
				spacing().edgeLength / 2
			);
			if (duration === 0) return;
			for (const [id, { at }] of placements) {
				motion.whileMoving((complete) =>
					cy.$id(id).animate({ position: at }, { duration, complete })
				);
			}
		}
	};
}
