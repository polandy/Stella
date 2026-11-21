import { PARENT_CHILD_TYPE_KEY, PARTNER_TYPE_KEYS } from '../../relationships/type-keys';
import { isFamilyLink } from '../model/generations';
import type { GraphEdge } from '../model/types';
import type { Point, SizeOf } from './geometry';
import { dockOffsets, parentKindOf } from './parent-pairs';

/*
 * What the family tree's lines and their crossings are both read from (docs/dev/05 §5.8), for
 * `tree-lines.ts`. Pure: the positions are worked out already.
 */

/** Two rows count as one within this much, so a rounding error never splits a row. */
export const SAME_ROW = 0.5;

/** A side of a person on their row: -1 left, 1 right. */
export type Outward = -1 | 1;

/** Where the line from a parent to a child leaves for the bar it runs along. */
export interface Drop {
	/** Lines with one group run along one bar. */
	group: string;
	x: number;
	/** Set for a lone parent's bar leaving from their outer edge, out past their name. */
	outward?: Outward;
}

/** Partners stand side by side on one row; their bar is the one line the tree keeps straight. */
export function isPartnerLine(edge: GraphEdge): boolean {
	return edge.typeKey !== undefined && PARTNER_TYPE_KEYS.includes(edge.typeKey);
}

/**
 * What both the lines and their crossings are read from: the family lines between members, and
 * where the line from a parent to a child leaves. A child's parents standing side by side share
 * one bar: partners, former or not, drop once from the middle of the line between them;
 * co-parents with no partnership entered each drop from under their own name into it. A parent
 * with nobody beside them, or somebody standing in between, has a bar of their own — dropped from
 * their outer edge, away from the one beside them they share another bar with, so the two bars
 * never share a stretch under the couple. Parents of different kinds never share a bar: a
 * step-parent's, a foster family's and the biological parents' are each their own, and a child
 * with several docks on top of it, one per bar, so their drops never run down one line.
 */
export function familyStructure(
	edges: readonly GraphEdge[],
	positions: ReadonlyMap<string, Point>,
	members: ReadonlySet<string>,
	sizeOf: SizeOf
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
	const kinds = new Map<string, string>();
	const kindOf = (parent: string, child: string) => kinds.get(`${parent}|${child}`);
	const link = (map: Map<string, Set<string>>, a: string, b: string) => {
		if (!map.has(a)) map.set(a, new Set());
		map.get(a)!.add(b);
	};
	for (const e of familyLines) {
		if (isPartnerLine(e)) {
			link(partners, e.source, e.target);
			link(partners, e.target, e.source);
		}
		if (e.typeKey === PARENT_CHILD_TYPE_KEY) {
			link(parents, e.target, e.source);
			kinds.set(`${e.source}|${e.target}`, parentKindOf(e));
		}
	}
	/** The parents of `child` who share a bar's kind with `parent` over that child. */
	const ofKind = (parent: string, child: string) =>
		[...(parents.get(child) ?? [])].filter((p) => kindOf(p, child) === kindOf(parent, child));

	/** Whether somebody other than `except` stands on the row at `y`, strictly between x1 and x2. */
	const standsBetween = (y: number, x1: number, x2: number, except: readonly string[]) =>
		[...positions].some(
			([id, p]) =>
				!except.includes(id) &&
				Math.abs(p.y - y) < SAME_ROW &&
				p.x > Math.min(x1, x2) &&
				p.x < Math.max(x1, x2)
		);

	/** Who shares a bar with `parent` over another child: their co-parents on the map. */
	const coParentsOf = (parent: string) => {
		const coParents = new Set<string>();
		for (const [child, together] of parents) {
			if (!together.has(parent)) continue;
			for (const p of ofKind(parent, child)) if (p !== parent) coParents.add(p);
		}
		return coParents;
	};

	/**
	 * Which way is out for a parent standing beside somebody they share a bar with: away from
	 * them, -1 left or 1 right. Undefined with nobody such beside them, or one on each side.
	 */
	const outwardOf = (parent: string): Outward | undefined => {
		const p = at(parent);
		const sides = new Set(
			[...coParentsOf(parent)]
				.filter((other) => positions.has(other) && sameRow(at(other), p))
				.filter((other) => !standsBetween(p.y, p.x, at(other).x, [parent, other]))
				.map((other) => Math.sign(p.x - at(other).x))
		);
		return sides.size === 1 ? ([...sides][0] as Outward) : undefined;
	};

	const dropOf = (parent: string, child: string): Drop => {
		const together = [
			parent,
			...ofKind(parent, child).filter((p) => p !== parent && sameRow(at(p), at(parent)))
		].sort();
		const xs = together.map((id) => at(id).x);
		const apart =
			together.length === 1 ||
			standsBetween(at(parent).y, Math.min(...xs), Math.max(...xs), together);
		if (apart) {
			const outward = outwardOf(parent);
			if (outward === undefined) return { group: `drop:${parent}`, x: at(parent).x };
			const x = at(parent).x + (outward * sizeOf(parent).width) / 2;
			return { group: `drop:${parent}`, x, outward };
		}
		const group = `drop:${together.join('+')}`;
		const couple = together.length === 2 && partners.get(together[0])?.has(together[1]);
		return { group, x: couple ? (xs[0] + xs[1]) / 2 : at(parent).x };
	};

	/** The bars a child hangs from, left to right as their drops stand. */
	const barsOf = (child: string): string[] => {
		const drops = new Map<string, number>();
		for (const p of parents.get(child) ?? []) {
			if (at(p).y >= at(child).y - SAME_ROW) continue;
			const drop = dropOf(p, child);
			drops.set(drop.group, drop.x);
		}
		return [...drops]
			.sort(([ga, a], [gb, b]) => a - b || (ga < gb ? -1 : 1))
			.map(([group]) => group);
	};
	const barsOver = (child: string) => barsOf(child).length;

	/**
	 * The x where the line from `parent` docks on top of `child`: the child's centre under one bar,
	 * one dock per bar under several, left to right as their drops stand.
	 */
	const dockOf = (parent: string, child: string): number => {
		const bars = barsOf(child);
		const index = bars.indexOf(dropOf(parent, child).group);
		return at(child).x + (dockOffsets(bars.length)[index] ?? 0);
	};

	return { at, sameRow, familyLines, standsBetween, dropOf, dockOf, barsOver };
}
