import type { Point, Size, SizeOf } from './geometry';

/*
 * A group by role as one block (docs/02 §2.7). Pure geometry: the renderer draws the frame
 * around wherever the members stand, so standing them together is what makes a group compact.
 */

/**
 * The room a group's frame takes beyond its members: its padding on every side and the name
 * drawn on top. The stylesheet's `node.role-group` draws the padding from here.
 */
export const FRAME = { padding: 16, label: 24 } as const;
/** The least room between two members' names. */
const GAP = 30;

/** Where each member stands from the block's centre, and how far the block reaches. */
export interface GroupBlock {
	offsets: Point[];
	/** The half-diagonal: turned any way, the block's corner is what comes nearest the rest. */
	reach: number;
}

/** The members in rows as near square as they go, below room for the frame's name. */
export function groupBlock(ids: readonly string[], sizeOf: SizeOf): GroupBlock {
	const sizes = ids.map(sizeOf);
	const cell = {
		width: Math.max(...sizes.map((s) => s.width)) + GAP,
		height: Math.max(...sizes.map((s) => s.height)) + GAP
	};
	const columns = Math.ceil(Math.sqrt(ids.length));
	const rows = Math.ceil(ids.length / columns);
	const outer = {
		width: columns * cell.width - GAP + 2 * FRAME.padding,
		height: rows * cell.height - GAP + 2 * FRAME.padding + FRAME.label
	};
	const offsets = ids.map((_, k) => ({
		x: ((k % columns) - (columns - 1) / 2) * cell.width,
		y: (Math.floor(k / columns) - (rows - 1) / 2) * cell.height + FRAME.label / 2
	}));
	return { offsets, reach: Math.hypot(outer.width, outer.height) / 2 };
}

/**
 * `positions` with each group's members gathered into a block where the group stood (the
 * centre of its members). Everybody else stays where they are — unless a block now stands on
 * them, which would hide their name and take their tap: they step out beside its frame.
 */
export function packGroups(
	positions: ReadonlyMap<string, Point>,
	groups: readonly (readonly string[])[],
	sizeOf: SizeOf
): Map<string, Point> {
	const packed = new Map(positions);
	const frames: Extent[] = [];
	const members = new Set<string>();
	for (const ids of groups) {
		const placed = ids.filter((id) => positions.has(id));
		if (placed.length === 0) continue;
		const centre = {
			x: placed.reduce((sum, id) => sum + positions.get(id)!.x, 0) / placed.length,
			y: placed.reduce((sum, id) => sum + positions.get(id)!.y, 0) / placed.length
		};
		const { offsets } = groupBlock(placed, sizeOf);
		placed.forEach((id, k) => {
			packed.set(id, { x: centre.x + offsets[k].x, y: centre.y + offsets[k].y });
			members.add(id);
		});
		frames.push(
			frameAround(boxAround(placed.map((id) => ({ at: packed.get(id)!, size: sizeOf(id) }))))
		);
	}
	for (const [id, at] of packed) {
		if (!members.has(id)) packed.set(id, clearOf(frames, at, sizeOf(id)));
	}
	return packed;
}

/**
 * Where a node of `size` at `from` stands clear of every frame: where it is if nothing covers
 * it, else the nearest spot just past a covering frame's side. Stepping out of one frame can
 * land in its neighbour, so a spot clear of all is preferred, and the step repeats from there.
 */
function clearOf(frames: readonly Extent[], from: Point, size: Size): Point {
	const covering = (at: Point) => frames.filter((frame) => overlaps(frame, at, size));
	const distance = (at: Point) => Math.hypot(at.x - from.x, at.y - from.y);
	let at = from;
	// A step per frame at most: past that the spot is crowded beyond help, and the last exit stands.
	for (let step = 0; step <= frames.length; step++) {
		const over = covering(at);
		if (over.length === 0) return at;
		const exits = over.flatMap((frame) => [
			{ x: frame.x1 - size.width / 2 - GAP, y: at.y },
			{ x: frame.x2 + size.width / 2 + GAP, y: at.y },
			{ x: at.x, y: frame.y1 - size.height / 2 - GAP },
			{ x: at.x, y: frame.y2 + size.height / 2 + GAP }
		]);
		const clear = exits.filter((exit) => covering(exit).length === 0);
		at = (clear.length > 0 ? clear : exits).reduce((best, exit) =>
			distance(exit) < distance(best) ? exit : best
		);
	}
	return at;
}

/** Whether a node of `size` at `at` reaches into `frame`. */
function overlaps(frame: Extent, at: Point, size: Size): boolean {
	return (
		at.x + size.width / 2 > frame.x1 &&
		at.x - size.width / 2 < frame.x2 &&
		at.y + size.height / 2 > frame.y1 &&
		at.y - size.height / 2 < frame.y2
	);
}

/** The box nodes set at `at` take, each its own `size`. */
export function boxAround(nodes: readonly { at: Point; size: Size }[]): Extent {
	return {
		x1: Math.min(...nodes.map((n) => n.at.x - n.size.width / 2)),
		y1: Math.min(...nodes.map((n) => n.at.y - n.size.height / 2)),
		x2: Math.max(...nodes.map((n) => n.at.x + n.size.width / 2)),
		y2: Math.max(...nodes.map((n) => n.at.y + n.size.height / 2))
	};
}

/** A box on the canvas, from its top-left to its bottom-right corner. */
interface Extent {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

/**
 * The room a group's frame fills around the box its members take: framing the map on the
 * members alone would tuck the frame's name under whatever floats above the canvas.
 */
export function frameAround(members: Extent): Extent {
	return {
		x1: members.x1 - FRAME.padding,
		y1: members.y1 - FRAME.padding - FRAME.label,
		x2: members.x2 + FRAME.padding,
		y2: members.y2 + FRAME.padding
	};
}
