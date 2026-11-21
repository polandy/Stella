import type { GraphEdge } from '../model/types';
import type { Bridge, Point, Route } from './geometry';

/*
 * Where one line of the family tree still runs across another's bar once the lanes are set
 * (docs/dev/05 §5.8): there the bar gets a short gap the crossing line runs through, so the
 * crossing reads as a bridge and not as a junction. Pure.
 */

/** One line's ends and bends, as drawn: where it leaves its source, its bends, its target. */
export interface DrawnLine {
	id: string;
	points: Point[];
}

/** Off either end of a piece by less than this counts as its end: a corner, not a crossing. */
const AT_THE_END = 0.5;

/** Every point where an upright piece of one line crosses a level piece of another. */
export function bridgesOf(lines: readonly DrawnLine[]): Bridge[] {
	const pieces = lines.flatMap((line) =>
		line.points.slice(1).map((to, i) => ({ id: line.id, from: line.points[i], to }))
	);
	const upright = pieces.filter((p) => p.from.x === p.to.x && p.from.y !== p.to.y);
	const level = pieces.filter((p) => p.from.y === p.to.y && p.from.x !== p.to.x);
	const between = (v: number, a: number, b: number) =>
		v > Math.min(a, b) + AT_THE_END && v < Math.max(a, b) - AT_THE_END;

	const bridges = new Map<string, Bridge>();
	for (const up of upright) {
		for (const bar of level) {
			if (up.id === bar.id) continue;
			const at = { x: up.from.x, y: bar.from.y };
			if (!between(at.x, bar.from.x, bar.to.x) || !between(at.y, up.from.y, up.to.y)) continue;
			// A line running along the same bar the crossing one sits on is no crossing of that bar.
			if (level.some((p) => p.id === up.id && p.from.y === at.y && between(at.x, p.from.x, p.to.x)))
				continue;
			const key = `${at.x}|${at.y}`;
			const known = bridges.get(key) ?? { at, over: [] };
			if (!known.over.includes(up.id)) known.over.push(up.id);
			bridges.set(key, known);
		}
	}
	return [...bridges.values()];
}

/** A routed line as drawn, given where its two people stand. */
export function drawnLine(id: string, route: Route, source: Point, target: Point): DrawnLine {
	return {
		id,
		points: [route.sourceEnd ?? source, ...route.waypoints, route.targetEnd ?? target]
	};
}

/** The bridges of the tree's routed lines, each read from where its two people stand. */
export function routeBridges(
	routes: ReadonlyMap<string, Route>,
	edges: readonly GraphEdge[],
	positions: ReadonlyMap<string, Point>
): Bridge[] {
	const edgeById = new Map(edges.map((e) => [e.id, e]));
	return bridgesOf(
		[...routes].map(([id, route]) => {
			const { source, target } = edgeById.get(id)!;
			return drawnLine(id, route, positions.get(source)!, positions.get(target)!);
		})
	);
}
