/*
 * Where the people an expand brings in first appear (docs/05 §5.8). Pure geometry, so it tests
 * without Cytoscape: the canvas the reader has been looking at is their map of it, and an
 * expand that re-arranged everything made them find their way again. Instead every newcomer
 * is set down one edge length from the person it hangs off, fanned out into the open side of
 * that person, and nobody already on the canvas is touched.
 */

/** A position on the canvas, in the renderer's model coordinates. */
export interface Point {
	x: number;
	y: number;
}

/** An undirected tie between two node ids; only the ends matter for placement. */
export interface Link {
	source: string;
	target: string;
}

/** The widest a fan may open around its anchor before it moves further out instead. */
const MAX_FAN = Math.PI;
/** How far beside the map a newcomer with no tie to it is set down, in edge lengths. */
const DETACHED_OFFSET = 2;

/**
 * Starting positions for `newcomers`, given where everyone else already stands. Returns only
 * the newcomers — `placed` is never moved. A newcomer is anchored on a neighbour that already
 * has a place (one opened off another newcomer follows it, round by round); one with no tie to
 * anyone placed is set beside the map rather than on top of it.
 */
export function placeNewcomers(
	placed: ReadonlyMap<string, Point>,
	newcomers: readonly string[],
	links: readonly Link[],
	spacing: number
): Map<string, Point> {
	const neighbours = new Map<string, string[]>();
	const tie = (from: string, to: string) => {
		const list = neighbours.get(from);
		if (list) list.push(to);
		else neighbours.set(from, [to]);
	};
	for (const link of links) {
		if (link.source === link.target) continue;
		tie(link.source, link.target);
		tie(link.target, link.source);
	}

	const positions = new Map(placed);
	const result = new Map<string, Point>();
	const centre = centroid([...placed.values()]);
	let pending = newcomers.filter((id) => !placed.has(id));

	while (pending.length > 0) {
		// Everyone reachable from a placed person this round, grouped under that person.
		const byAnchor = new Map<string, string[]>();
		for (const id of pending) {
			const anchor = neighbours.get(id)?.find((n) => positions.has(n));
			if (anchor === undefined) continue;
			const group = byAnchor.get(anchor);
			if (group) group.push(id);
			else byAnchor.set(anchor, [id]);
		}

		if (byAnchor.size === 0) {
			// Nobody left has a tie to the map: start an island beside it and grow from there.
			const [first] = pending;
			const point = besideMap([...positions.values()], centre, spacing);
			positions.set(first, point);
			result.set(first, point);
			pending = pending.slice(1);
			continue;
		}

		for (const [anchorId, group] of byAnchor) {
			const anchor = positions.get(anchorId)!;
			const taken = (neighbours.get(anchorId) ?? [])
				.filter((n) => positions.has(n))
				.map((n) => positions.get(n)!);
			const heading = openSide(anchor, taken, centre);
			fan(anchor, heading, group.length, spacing).forEach((point, i) => {
				positions.set(group[i], point);
				result.set(group[i], point);
			});
		}
		pending = pending.filter((id) => !positions.has(id));
	}
	return result;
}

function centroid(points: Point[]): Point {
	if (points.length === 0) return { x: 0, y: 0 };
	const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
	return { x: sum.x / points.length, y: sum.y / points.length };
}

/**
 * The direction from `anchor` with the most room: the middle of the widest gap between the
 * directions to the anchor's placed neighbours and to the centre of the map. With nothing to
 * steer by, it opens to the right.
 */
function openSide(anchor: Point, taken: Point[], centre: Point): number {
	const toward = [...taken, centre]
		.filter((p) => Math.hypot(p.x - anchor.x, p.y - anchor.y) > Number.EPSILON)
		.map((p) => Math.atan2(p.y - anchor.y, p.x - anchor.x))
		.sort((a, b) => a - b);
	if (toward.length === 0) return 0;

	let widest = 0;
	let heading = 0;
	for (let i = 0; i < toward.length; i++) {
		const from = toward[i];
		const to = i + 1 < toward.length ? toward[i + 1] : toward[0] + 2 * Math.PI;
		if (to - from > widest) {
			widest = to - from;
			heading = from + widest / 2;
		}
	}
	return heading;
}

/**
 * `count` points on an arc around `anchor`, centred on `heading`, neighbours one edge length
 * apart. A fan that would open wider than {@link MAX_FAN} moves out to a larger radius instead,
 * so a big family stays on the open side rather than wrapping back into the map.
 */
function fan(anchor: Point, heading: number, count: number, spacing: number): Point[] {
	const radius = Math.max(spacing, ((count - 1) * spacing) / MAX_FAN);
	const step = spacing / radius;
	const start = heading - ((count - 1) * step) / 2;
	return Array.from({ length: count }, (_, i) => ({
		x: anchor.x + radius * Math.cos(start + i * step),
		y: anchor.y + radius * Math.sin(start + i * step)
	}));
}

/** A spot right of everything already placed, level with the centre of the map. */
function besideMap(points: Point[], centre: Point, spacing: number): Point {
	const right = points.length === 0 ? centre.x : Math.max(...points.map((p) => p.x));
	return { x: right + DETACHED_OFFSET * spacing, y: centre.y };
}
