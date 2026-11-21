import { PARENT_CHILD_TYPE_KEY } from '../../relationships/type-keys';
import type { GraphEdge } from '../model/types';
import { familyStructure, type Outward } from './family-structure';
import type { Point, SizeOf } from './geometry';
import { pairRank, type Hanging } from './parent-pairs';

/*
 * The stretch each bar of the family tree takes in its gap (docs/dev/05 §5.8), and how many of
 * them cross, for the tree's search for a row order (`family-rows.ts`). Pure.
 */

/** The stretch one couple's bar takes in the gap below their row: from their drop to each child. */
export interface BarSpan {
	/** The y of the parents' row. */
	channel: number;
	left: number;
	right: number;
	/** Who hangs from it. */
	children: string[];
	/** Where each of `children` docks, and how near it its pair should stand (`pairRank`). */
	docks: number[];
	ranks: number[];
	/** Who drops into it. */
	parents: string[];
	/** Where the drop from the parents meets it. */
	drop: number;
	/** Set for a lone parent's bar leaving from their outer edge, away from their couple. */
	outward?: Outward;
}

/** Every couple's (or lone parent's) bar over their children, as the stretch of its gap it takes. */
export function barSpans(
	edges: readonly GraphEdge[],
	positions: ReadonlyMap<string, Point>,
	members: ReadonlySet<string>,
	sizeOf: SizeOf
): BarSpan[] {
	const { at, familyLines, dropOf, dockOf } = familyStructure(edges, positions, members, sizeOf);
	const spans = new Map<string, BarSpan>();
	for (const e of familyLines) {
		if (e.typeKey !== PARENT_CHILD_TYPE_KEY || at(e.source).y >= at(e.target).y) continue;
		const drop = dropOf(e.source, e.target);
		const key = `${at(e.source).y}|${drop.group}`;
		const known = spans.get(key) ?? {
			channel: at(e.source).y,
			left: drop.x,
			right: drop.x,
			children: [],
			docks: [],
			ranks: [],
			parents: [],
			drop: drop.x,
			...(drop.outward ? { outward: drop.outward } : {})
		};
		const dock = dockOf(e.source, e.target);
		const hangsAlready = known.children.includes(e.target);
		spans.set(key, {
			...known,
			left: Math.min(known.left, drop.x, dock),
			right: Math.max(known.right, drop.x, dock),
			children: hangsAlready ? known.children : [...known.children, e.target],
			docks: hangsAlready ? known.docks : [...known.docks, dock],
			ranks: hangsAlready ? known.ranks : [...known.ranks, pairRank(e)],
			parents: known.parents.includes(e.source) ? known.parents : [...known.parents, e.source]
		});
	}
	return [...spans.values()];
}

/**
 * How many pairs of bars share a stretch of one gap. Each such pair crosses: one family's drop
 * runs down through the other's bar, and the reader can no longer tell whose children are whose.
 * Two pairs of parents over one child are the exception where their lanes keep every drop clear
 * of the other bar: their stretches have to meet over the child. A lone parent's bar running
 * back under their couple counts too: its children no longer read as that parent's alone, and
 * two drops stand under one couple.
 */
export function crossingBars(spans: readonly BarSpan[]): number {
	let crossings = spans.filter(reachesBack).length;
	for (let i = 0; i < spans.length; i++) {
		for (let j = i + 1; j < spans.length; j++) {
			const [a, b] = [spans[i], spans[j]];
			if (a.channel !== b.channel || a.left >= b.right || b.left >= a.right) continue;
			const shareAChild = a.children.some((c) => b.children.includes(c));
			if (!shareAChild || (throughBar(a, b) > 0 && throughBar(b, a) > 0)) crossings++;
		}
	}
	return crossings;
}

/**
 * How often a line runs through a bar with `below` on the lower lane: a drop of `below` rising
 * through `above`, or a dock of `above` falling through `below`.
 */
export function throughBar(below: BarSpan, above: BarSpan): number {
	const inside = (x: number, span: BarSpan) => x > span.left && x < span.right;
	return (inside(below.drop, above) ? 1 : 0) + above.docks.filter((x) => inside(x, below)).length;
}

/** Whether a lone parent's bar runs back from their outer edge, in under their couple. */
export function reachesBack(span: BarSpan): boolean {
	if (span.outward === -1) return span.right > span.drop;
	if (span.outward === 1) return span.left < span.drop;
	return false;
}

/** Each child's place on each bar it hangs from, for `pairOrderBreaks`. */
export function hangings(
	spans: readonly BarSpan[],
	positions: ReadonlyMap<string, Point>
): Hanging[] {
	return spans.flatMap((span) =>
		span.children.map((child, i) => ({
			child,
			at: positions.get(child)!.x,
			drop: span.drop,
			rank: span.ranks[i]
		}))
	);
}
