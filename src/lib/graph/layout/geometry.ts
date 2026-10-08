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
 *
 * The family tree also draws its family lines at right angles (`routes`), and says where the
 * people outside the family begin (`outsideFamily`), so that shelf can be named.
 */
export interface Arrangement {
	positions: Map<string, Point>;
	bows: Map<string, number>;
	/** Lines drawn as a run of straight pieces instead; a line is never both routed and bowed. */
	routes?: Map<string, Route>;
	/** The top left corner of the shelf of people outside the family, when there is one. */
	outsideFamily?: Point;
}

/**
 * A line drawn as straight pieces through `waypoints`, in model units, travelled from its source
 * to its target. It leaves its source at `sourceEnd` when given — the middle of a partner bar
 * rather than the person — and arrives at `targetEnd` likewise; otherwise at the node itself.
 */
export interface Route {
	waypoints: Point[];
	/**
	 * Which end's last drop carries the line's name — the lower person's, where the line comes
	 * down to them — or null where another line already names that drop (a child's two parents).
	 */
	nameEnd: 'source' | 'target' | null;
	sourceEnd?: Point;
	targetEnd?: Point;
}

/**
 * Rows of `ids`, left to right from `origin`, each node given its own width plus `gap`, never
 * running past `width`. As few rows as that takes, and those rows as even as they can be — the
 * narrowest width that still needs no more rows — so no last row holds one straggler. For
 * whoever an arrangement has no better place for.
 */
export function shelve(
	ids: readonly string[],
	origin: Point,
	width: number,
	sizeOf: SizeOf,
	gap: number,
	rowGap: number
): Map<string, Point> {
	const rowsAt = (limit: number) => {
		const rows: string[][] = [];
		let cursor = 0;
		for (const id of ids) {
			const size = sizeOf(id).width;
			if (rows.length === 0 || (cursor > 0 && cursor + size > limit)) {
				rows.push([]);
				cursor = 0;
			}
			rows[rows.length - 1].push(id);
			cursor += size + gap;
		}
		return rows;
	};
	const fewest = rowsAt(width).length;
	// The narrowest limit that still needs no more rows than the full width does.
	let [low, high] = [Math.max(0, ...ids.map((id) => sizeOf(id).width)), Math.max(width, 0)];
	for (let step = 0; step < 32 && high - low > 1; step++) {
		const middle = (low + high) / 2;
		if (rowsAt(middle).length <= fewest) high = middle;
		else low = middle;
	}

	const positions = new Map<string, Point>();
	let top = origin.y;
	for (const row of rowsAt(high)) {
		let cursor = 0;
		let rowHeight = 0;
		for (const id of row) {
			const size = sizeOf(id);
			positions.set(id, { x: origin.x + cursor + size.width / 2, y: top + size.height / 2 });
			cursor += size.width + gap;
			rowHeight = Math.max(rowHeight, size.height);
		}
		top += rowHeight + rowGap;
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

/** The golden angle: each next point on the spiral turns this far, so none line up. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * `positions` with everyone who shares a spot with somebody set apart around it, on a
 * sunflower spiral at least `spacing` between neighbours; whoever stands alone stays put.
 * Spread in the order of their ids, so the force layout, which parts two nodes on one spot in
 * a random direction, has no tie left to break (docs/04 §4.11).
 */
export function spreadCoincident(
	positions: ReadonlyMap<string, Point>,
	spacing: number
): Map<string, Point> {
	const bySpot = new Map<string, string[]>();
	for (const [id, { x, y }] of positions) {
		const spot = `${x},${y}`;
		bySpot.set(spot, [...(bySpot.get(spot) ?? []), id]);
	}
	const spread = new Map(positions);
	for (const ids of bySpot.values()) {
		if (ids.length < 2) continue;
		const centre = positions.get(ids[0])!;
		[...ids].sort().forEach((id, k) => {
			const radius = spacing * Math.sqrt(k);
			spread.set(id, {
				x: centre.x + radius * Math.cos(k * GOLDEN_ANGLE),
				y: centre.y + radius * Math.sin(k * GOLDEN_ANGLE)
			});
		});
	}
	return spread;
}

/**
 * Who in `arrangement` stands in the family: everyone above the shelf of people outside it, or
 * everyone when there is no such shelf. The family is what framing keeps first (docs/05 §5.8).
 */
export function familyIn({
	positions,
	outsideFamily
}: Pick<Arrangement, 'positions' | 'outsideFamily'>): Set<string> {
	return new Set(
		[...positions].filter(([, at]) => !outsideFamily || at.y < outsideFamily.y).map(([id]) => id)
	);
}
