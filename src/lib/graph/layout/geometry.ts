/*
 * Shared geometry of the explorer's arrangements (docs/05 §5.8). Pure: the layouts in this
 * folder compute positions in model units, and the Cytoscape adapter only moves nodes there.
 */

/** A position on the canvas, in the renderer's model coordinates. */
export interface Point {
	x: number;
	y: number;
}

/** How much room a node takes on the canvas, its name included, in model units. */
export interface Size {
	width: number;
	height: number;
}

/** The room each node takes; an arrangement asks rather than assuming one width for all. */
export type SizeOf = (id: string) => Size;

/** The room a person with a short name takes, for when nobody has measured the nodes. */
export const DEFAULT_NODE_SIZE: Size = { width: 110, height: 70 };

/** Asks nothing of a renderer: every node the default size. */
export const defaultSizeOf: SizeOf = () => DEFAULT_NODE_SIZE;

/** How much room a bent line keeps from a node it goes around. */
export const LINE_CLEARANCE = 12;

/** A line between two nodes; only its ends matter to the geometry. */
export interface Line {
	id: string;
	source: string;
	target: string;
}

/**
 * What an arrangement hands the renderer: where every node goes, and which lines bend around
 * a node standing in their way — each with its bow, the sideways offset of the bend's control
 * point from the straight line, positive towards the left-hand normal (-dy, dx) of the line
 * travelled from source to target. Lines not listed are drawn straight.
 */
export interface Arrangement {
	positions: Map<string, Point>;
	bows: Map<string, number>;
}

/**
 * Rows of `ids`, left to right from `origin`, each node given its own width plus `gap`,
 * wrapping to a new row before `width` is passed. For whoever an arrangement has no better
 * place for.
 */
export function shelve(
	ids: readonly string[],
	origin: Point,
	width: number,
	sizeOf: SizeOf,
	gap: number,
	rowGap: number
): Map<string, Point> {
	const positions = new Map<string, Point>();
	let cursor = 0;
	let top = origin.y;
	let rowHeight = 0;
	for (const id of ids) {
		const size = sizeOf(id);
		if (cursor > 0 && cursor + size.width > width) {
			cursor = 0;
			top += rowHeight + rowGap;
			rowHeight = 0;
		}
		positions.set(id, { x: origin.x + cursor + size.width / 2, y: top + size.height / 2 });
		cursor += size.width + gap;
		rowHeight = Math.max(rowHeight, size.height);
	}
	return positions;
}

/**
 * The lines that would pass through a node on their way, each with the bow that carries it
 * around every such node with `clearance` to spare, bending to whichever side needs the
 * smaller bend. A bezier's middle strays half its bow from the straight line, so the bow is
 * twice the room it has to make.
 */
export function bowsAround(
	positions: ReadonlyMap<string, Point>,
	lines: readonly Line[],
	sizeOf: SizeOf,
	clearance: number
): Map<string, number> {
	const bows = new Map<string, number>();
	for (const line of lines) {
		const from = positions.get(line.source);
		const to = positions.get(line.target);
		if (!from || !to || line.source === line.target) continue;
		const length = Math.hypot(to.x - from.x, to.y - from.y);
		if (length === 0) continue;
		const along = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
		const normal = { x: -along.y, y: along.x };

		// How far the middle of the line has to move to each side to clear everyone on it.
		let towardsNormal = 0;
		let awayFromNormal = 0;
		for (const [id, point] of positions) {
			if (id === line.source || id === line.target) continue;
			const offset = { x: point.x - from.x, y: point.y - from.y };
			const projection = offset.x * along.x + offset.y * along.y;
			if (projection <= 0 || projection >= length) continue;
			const side = offset.x * normal.x + offset.y * normal.y;
			const size = sizeOf(id);
			const reach = Math.max(size.width, size.height) / 2 + clearance;
			if (Math.abs(side) >= reach) continue;
			towardsNormal = Math.max(towardsNormal, side + reach);
			awayFromNormal = Math.max(awayFromNormal, reach - side);
		}
		if (towardsNormal === 0 && awayFromNormal === 0) continue;
		bows.set(line.id, towardsNormal <= awayFromNormal ? 2 * towardsNormal : -2 * awayFromNormal);
	}
	return bows;
}
