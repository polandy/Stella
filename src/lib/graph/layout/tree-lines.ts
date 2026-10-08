import { PARENT_CHILD_TYPE_KEY, PARTNER_TYPE_KEYS } from '../../relationships/type-keys';
import { isFamilyLink } from '../model/generations';
import type { GraphEdge } from '../model/types';
import { LINE_CLEARANCE, type Point, type Route, type SizeOf } from './geometry';

/*
 * The lines of the family tree (docs/05 §5.8), drawn the way a family tree is drawn on paper:
 * partners joined by a short bar, one drop from the middle of it to a bar over their children,
 * and a short drop from that bar to each child — right angles instead of diagonals. Pure: the
 * positions are worked out already, and this only says where each family line bends.
 *
 * Every horizontal piece runs in the gap between two rows, where nobody stands; every vertical
 * piece either drops into the person it ends at or down a column that is clear of everybody on
 * the rows it passes — so, as before, no line runs through a person. Where two bars would run
 * along the same stretch of one gap they are set a lane apart, so one family's bar is never read
 * as another's.
 */

/** Distances of the tree's lines, in model units unless said otherwise. */
export const TREE_LINES = {
	/** Where a bar runs below the row above it, as a share of the distance between two rows. */
	bar: 0.55,
	/** Between two bars that would otherwise run along each other. */
	lane: 14,
	/** The lanes one gap between rows has room for; more are squeezed into the same room. */
	lanes: 4,
	/** The room left between two bars that end and begin on the same lane. */
	margin: 8
} as const;

/** Two rows count as one within this much, so a rounding error never splits a row. */
const SAME_ROW = 0.5;

/** One horizontal piece of a line, before the lane it runs on is known. */
interface Leg {
	/** The y of the row above the gap the piece runs in. */
	channel: number;
	/** Pieces of one group share a lane: the bar over one couple's children is one group. */
	group: string;
	x1: number;
	x2: number;
}

/** A line whose bends wait for the lanes: `points` turns the lanes into its waypoints. */
interface Plan {
	edge: GraphEdge;
	legs: Leg[];
	points: (yOf: (leg: Leg) => number) => Point[];
	/** Where it leaves the upper of its two people, when not from that person. */
	start?: { at: Point; upper: string };
	/** Lines with one key share their last drop, which only the first of them names. */
	nameKey: string;
	/** The person the last drop comes down to. */
	lower: string;
}

/**
 * Where every family line between two members of the family bends, keyed by the line's id. A
 * partner bar between two people standing side by side is left out: it is drawn straight. Lines
 * to anybody outside the family are left out too; they keep the arrangement's bows.
 */
export function treeRoutes(
	edges: readonly GraphEdge[],
	positions: ReadonlyMap<string, Point>,
	members: ReadonlySet<string>,
	sizeOf: SizeOf,
	row: number
): Map<string, Route> {
	const { at, sameRow, familyLines, standsBetween, dropOf } = familyStructure(
		edges,
		positions,
		members
	);
	const parents = new Map<string, Set<string>>();
	for (const e of familyLines) {
		if (e.typeKey !== PARENT_CHILD_TYPE_KEY) continue;
		if (!parents.has(e.target)) parents.set(e.target, new Set());
		parents.get(e.target)!.add(e.source);
	}

	/** The bar a child hangs from, for each of its parents on the map. */
	const barsOf = (child: string) =>
		new Set([...(parents.get(child) ?? [])].map((parent) => dropOf(parent, child).group));

	/**
	 * A column from the gap below `top` to the gap above `bottom` that clears everybody on the rows
	 * in between, as close to `prefer` as there is one.
	 */
	const clearColumn = (prefer: number, alternative: number, top: number, bottom: number) => {
		const inTheWay = [...positions]
			.filter(([, p]) => p.y > top + SAME_ROW && p.y < bottom - SAME_ROW)
			.map(([id, p]) => ({ x: p.x, reach: sizeOf(id).width / 2 + LINE_CLEARANCE }));
		const clear = (x: number) => inTheWay.every((p) => Math.abs(x - p.x) >= p.reach);
		const candidates = [
			prefer,
			alternative,
			...inTheWay.flatMap((p) => [p.x - p.reach, p.x + p.reach])
		].filter(clear);
		candidates.sort(
			(a, b) =>
				Math.abs(a - prefer) - Math.abs(b - prefer) ||
				Math.abs(a - alternative) - Math.abs(b - alternative) ||
				a - b
		);
		return candidates[0];
	};

	const plans: Plan[] = [];
	for (const edge of familyLines) {
		const [s, t] = [at(edge.source), at(edge.target)];
		if (sameRow(s, t)) {
			if (isPartnerLine(edge) && !standsBetween(s.y, s.x, t.x, [edge.source, edge.target])) {
				continue;
			}
			// Over the top of the row, in the gap above it — along the bar the two already hang
			// from when they are siblings, since that bar already says so.
			const shared = [...barsOf(edge.source)].find((g) => barsOf(edge.target).has(g));
			const leg = { channel: s.y - row, group: shared ?? `line:${edge.id}`, x1: s.x, x2: t.x };
			plans.push({
				edge,
				legs: [leg],
				nameKey: edge.id,
				lower: edge.target,
				points: (yOf) => [
					{ x: s.x, y: yOf(leg) },
					{ x: t.x, y: yOf(leg) }
				]
			});
			continue;
		}

		const [upper, lower] = s.y < t.y ? [edge.source, edge.target] : [edge.target, edge.source];
		const [u, l] = [at(upper), at(lower)];
		const drop =
			edge.typeKey === PARENT_CHILD_TYPE_KEY && upper === edge.source
				? dropOf(upper, lower)
				: { group: `line:${edge.id}:top`, x: u.x, couple: [upper] };
		const start = drop.x === u.x ? undefined : { at: { x: drop.x, y: u.y }, upper };

		if (l.y - u.y < row + SAME_ROW) {
			const leg = { channel: u.y, group: drop.group, x1: drop.x, x2: l.x };
			plans.push({
				edge,
				legs: [leg],
				start,
				nameKey: `${drop.group}|${lower}`,
				lower,
				points: (yOf) => [
					{ x: drop.x, y: yOf(leg) },
					{ x: l.x, y: yOf(leg) }
				]
			});
			continue;
		}

		// Past a row of people in between: across to a clear column, down it, across to the person.
		const column = clearColumn(l.x, drop.x, u.y, l.y);
		const top = { channel: u.y, group: drop.group, x1: drop.x, x2: column };
		const bottom = { channel: l.y - row, group: `line:${edge.id}:bottom`, x1: column, x2: l.x };
		plans.push({
			edge,
			legs: [top, bottom],
			start,
			nameKey: edge.id,
			lower,
			points: (yOf) => [
				{ x: drop.x, y: yOf(top) },
				{ x: column, y: yOf(top) },
				{ x: column, y: yOf(bottom) },
				{ x: l.x, y: yOf(bottom) }
			]
		});
	}

	const offsetOf = laneOffsets(plans.flatMap((p) => p.legs));
	const yOf = (leg: Leg) => leg.channel + TREE_LINES.bar * row + offsetOf.get(laneKey(leg))!;

	const routes = new Map<string, Route>();
	const named = new Set<string>();
	for (const plan of plans) {
		const { edge } = plan;
		const nameEnd = named.has(plan.nameKey)
			? null
			: plan.lower === edge.source
				? ('source' as const)
				: ('target' as const);
		named.add(plan.nameKey);
		const downward = withoutRepeats(plan.points(yOf));
		// The points run from the upper person down; a line travelled upwards takes them reversed.
		const fromUpper =
			at(edge.source).y < at(edge.target).y || sameRow(at(edge.source), at(edge.target));
		const route: Route = { waypoints: fromUpper ? downward : downward.reverse(), nameEnd };
		if (plan.start) {
			if (plan.start.upper === edge.source) route.sourceEnd = plan.start.at;
			else route.targetEnd = plan.start.at;
		}
		routes.set(edge.id, route);
	}
	return routes;
}

/** Partners stand side by side on one row; their bar is the one line the tree keeps straight. */
function isPartnerLine(edge: GraphEdge): boolean {
	return edge.typeKey !== undefined && PARTNER_TYPE_KEYS.includes(edge.typeKey);
}

/**
 * What both the lines and their crossings are read from: the family lines between members, and
 * where the line from a parent to a child leaves — the middle of the bar between the parent and
 * the partners who are this child's parents too, or the parent alone. One drop per couple.
 */
function familyStructure(
	edges: readonly GraphEdge[],
	positions: ReadonlyMap<string, Point>,
	members: ReadonlySet<string>
) {
	const at = (id: string) => positions.get(id)!;
	const sameRow = (a: Point, b: Point) => Math.abs(a.y - b.y) < SAME_ROW;
	const familyLines = edges.filter(
		(e) =>
			e.source !== e.target &&
			members.has(e.source) &&
			members.has(e.target) &&
			positions.has(e.source) &&
			positions.has(e.target) &&
			isFamilyLink(e)
	);

	const partners = new Map<string, Set<string>>();
	const parents = new Map<string, Set<string>>();
	const link = (map: Map<string, Set<string>>, a: string, b: string) => {
		if (!map.has(a)) map.set(a, new Set());
		map.get(a)!.add(b);
	};
	for (const e of familyLines) {
		if (isPartnerLine(e)) {
			link(partners, e.source, e.target);
			link(partners, e.target, e.source);
		}
		if (e.typeKey === PARENT_CHILD_TYPE_KEY) link(parents, e.target, e.source);
	}

	/** Whether somebody other than `except` stands on the row at `y`, strictly between x1 and x2. */
	const standsBetween = (y: number, x1: number, x2: number, except: readonly string[]) =>
		[...positions].some(
			([id, p]) =>
				!except.includes(id) &&
				Math.abs(p.y - y) < SAME_ROW &&
				p.x > Math.min(x1, x2) &&
				p.x < Math.max(x1, x2)
		);

	const dropOf = (parent: string, child: string) => {
		const couple = [
			parent,
			...[...(partners.get(parent) ?? [])].filter(
				(p) => parents.get(child)?.has(p) && sameRow(at(p), at(parent))
			)
		].sort();
		const xs = couple.map((id) => at(id).x);
		const apart =
			couple.length === 1 || standsBetween(at(parent).y, Math.min(...xs), Math.max(...xs), couple);
		return apart
			? { group: `drop:${parent}`, x: at(parent).x, couple: [parent] }
			: { group: `drop:${couple.join('+')}`, x: xs.reduce((a, b) => a + b, 0) / xs.length, couple };
	};

	return { at, sameRow, familyLines, standsBetween, dropOf };
}

/** The stretch one couple's bar takes in the gap below their row: from their drop to each child. */
export interface BarSpan {
	/** The y of the parents' row. */
	channel: number;
	left: number;
	right: number;
}

/** Every couple's (or lone parent's) bar over their children, as the stretch of its gap it takes. */
export function barSpans(
	edges: readonly GraphEdge[],
	positions: ReadonlyMap<string, Point>,
	members: ReadonlySet<string>
): BarSpan[] {
	const { at, familyLines, dropOf } = familyStructure(edges, positions, members);
	const spans = new Map<string, BarSpan>();
	for (const e of familyLines) {
		if (e.typeKey !== PARENT_CHILD_TYPE_KEY || at(e.source).y >= at(e.target).y) continue;
		const drop = dropOf(e.source, e.target);
		const key = `${at(e.source).y}|${drop.group}`;
		const known = spans.get(key) ?? { channel: at(e.source).y, left: drop.x, right: drop.x };
		const child = at(e.target).x;
		spans.set(key, {
			...known,
			left: Math.min(known.left, child),
			right: Math.max(known.right, child)
		});
	}
	return [...spans.values()];
}

/**
 * How many pairs of bars share a stretch of one gap. Each such pair crosses: one family's drop
 * runs down through the other's bar, and the reader can no longer tell whose children are whose.
 */
export function crossingBars(spans: readonly BarSpan[]): number {
	let crossings = 0;
	for (let i = 0; i < spans.length; i++) {
		for (let j = i + 1; j < spans.length; j++) {
			const [a, b] = [spans[i], spans[j]];
			if (a.channel === b.channel && a.left < b.right && b.left < a.right) crossings++;
		}
	}
	return crossings;
}

const laneKey = (leg: Leg) => `${leg.channel}|${leg.group}`;

/**
 * How far below its gap's top bar each group of pieces runs: on the first lane, counted down,
 * where it overlaps nobody already there — left to right, so the same map gets the same lanes.
 * A gap needing more lanes than it has room for squeezes them closer together, never two
 * groups onto one lane.
 */
function laneOffsets(legs: readonly Leg[]): Map<string, number> {
	const lanes = assignLanes(legs);
	const used = new Map<number, number>();
	for (const leg of legs) {
		const lane = lanes.get(laneKey(leg))!;
		used.set(leg.channel, Math.max(used.get(leg.channel) ?? 0, lane + 1));
	}
	const room = (TREE_LINES.lanes - 1) * TREE_LINES.lane;
	const offsets = new Map<string, number>();
	for (const leg of legs) {
		const count = used.get(leg.channel)!;
		const step = count > TREE_LINES.lanes ? room / (count - 1) : TREE_LINES.lane;
		offsets.set(laneKey(leg), lanes.get(laneKey(leg))! * step);
	}
	return offsets;
}

/** A lane number for every group of pieces in each gap, as many lanes as the gap needs. */
function assignLanes(legs: readonly Leg[]): Map<string, number> {
	const spans = new Map<string, { channel: number; left: number; right: number }>();
	for (const leg of legs) {
		const key = laneKey(leg);
		const known = spans.get(key);
		const left = Math.min(leg.x1, leg.x2);
		const right = Math.max(leg.x1, leg.x2);
		spans.set(
			key,
			known
				? { ...known, left: Math.min(known.left, left), right: Math.max(known.right, right) }
				: { channel: leg.channel, left, right }
		);
	}

	const lanes = new Map<string, number>();
	const ends = new Map<number, number[]>();
	const ordered = [...spans].sort(([ka, a], [kb, b]) => a.left - b.left || (ka < kb ? -1 : 1));
	for (const [key, span] of ordered) {
		const taken = ends.get(span.channel) ?? [];
		const free = taken.findIndex((end) => end + TREE_LINES.margin <= span.left);
		const lane = free === -1 ? taken.length : free;
		taken[lane] = span.right;
		ends.set(span.channel, taken);
		lanes.set(key, lane);
	}
	return lanes;
}

/** The points with any that repeat the one before dropped: a drop straight down has no corner. */
function withoutRepeats(points: Point[]): Point[] {
	return points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
}
