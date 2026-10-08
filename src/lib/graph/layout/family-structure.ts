import { PARENT_CHILD_TYPE_KEY, PARTNER_TYPE_KEYS } from '../../relationships/type-keys';
import { isFamilyLink } from '../model/generations';
import type { GraphEdge } from '../model/types';
import type { Point } from './geometry';

/*
 * What the family tree's lines and their crossings are both read from (docs/05 §5.8), for
 * `tree-lines.ts`. Pure: the positions are worked out already.
 */

/** Two rows count as one within this much, so a rounding error never splits a row. */
export const SAME_ROW = 0.5;

/** Partners stand side by side on one row; their bar is the one line the tree keeps straight. */
export function isPartnerLine(edge: GraphEdge): boolean {
	return edge.typeKey !== undefined && PARTNER_TYPE_KEYS.includes(edge.typeKey);
}

/**
 * What both the lines and their crossings are read from: the family lines between members, and
 * where the line from a parent to a child leaves — the middle of the bar between the parent and
 * the partners who are this child's parents too, or the parent alone. One drop per couple.
 */
export function familyStructure(
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
