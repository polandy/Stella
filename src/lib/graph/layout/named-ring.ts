/*
 * The People card's map preview on a phone (docs/05 §5.5): a picture of the people entered,
 * drawn by the server before — and instead of — the live map. A ring of bare faces said nothing
 * the list below did not, so every face carries its first name: over it in the upper half,
 * under it in the lower. A phone card has room for a handful of names, so past
 * `NAMED_RING_FACES` the last place is a "+N" disc for everyone else. The ring is flattened
 * into an ellipse and turned half a step, so no face sits level with this person's and a
 * name never lands on a neighbour.
 */

/** The ring's height in CSS pixels: `h-38`, 9.5 rem. */
export const RING_HEIGHT = 152;
/** The most places on the ring; past it the last one folds the rest into "+N". */
export const NAMED_RING_FACES = 8;

const CENTER_R = 16;
const NODE_R = 12;
/** The ring's half-width and half-height. */
const RX = 96;
const RY = 46;
/** The room one first name takes; a longer one is squeezed to fit. */
const LABEL_WIDTH = 60;
/** Wide enough for the ring and its outermost names; a narrower card crops the ends. */
const WIDTH = 2 * (RX + LABEL_WIDTH / 2);
/** A name's baseline over a face in the upper half, and under one in the lower. */
const LABEL_ABOVE = 16;
const LABEL_BELOW = 24;
/** How far the 11 px name reaches above its baseline and below it. */
const ASCENT = 10;
const DESCENT = 3;

export interface RingNode {
	x: number;
	y: number;
	/** Where the first name's baseline sits. */
	labelY: number;
}

export interface NamedRing {
	width: number;
	height: number;
	center: { x: number; y: number };
	centerR: number;
	nodeR: number;
	/** One per person shown, in the order given, clockwise. */
	nodes: RingNode[];
	/** The last place, standing for everyone not shown; null when everybody fits. */
	more: { x: number; y: number; count: number } | null;
	/** The room a name has, which the drawing gives its text as a maximum length. */
	labelWidth: number;
	/** The box a node's name takes. */
	labelBox: (node: RingNode) => { left: number; right: number; top: number; bottom: number };
}

/** Where `count` people stand in the ring. */
export function namedRing(count: number): NamedRing {
	const places = Math.min(count, NAMED_RING_FACES);
	const folded = count > NAMED_RING_FACES;
	const center = { x: WIDTH / 2, y: RING_HEIGHT / 2 };
	const step = (2 * Math.PI) / Math.max(places, 1);
	const spots = Array.from({ length: places }, (_, i) => {
		// From the top, clockwise, half a step on, so no place is level with the centre's sides.
		const angle = -Math.PI / 2 + (i + 0.5) * step;
		return { x: center.x + RX * Math.cos(angle), y: center.y + RY * Math.sin(angle) };
	});
	const shown = folded ? spots.slice(0, -1) : spots;
	const last = spots.at(-1);
	return {
		width: WIDTH,
		height: RING_HEIGHT,
		center,
		centerR: CENTER_R,
		nodeR: NODE_R,
		nodes: shown.map(({ x, y }) => ({
			x,
			y,
			labelY: y < center.y ? y - LABEL_ABOVE : y + LABEL_BELOW
		})),
		more: folded && last ? { ...last, count: count - shown.length } : null,
		labelWidth: LABEL_WIDTH,
		labelBox: (node) => ({
			left: node.x - LABEL_WIDTH / 2,
			right: node.x + LABEL_WIDTH / 2,
			top: node.labelY - ASCENT,
			bottom: node.labelY + DESCENT
		})
	};
}
