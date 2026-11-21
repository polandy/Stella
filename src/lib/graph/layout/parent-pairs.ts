import { BIOLOGICAL_PARENT_KIND, type ParentKind } from '../../relationships/parent-kinds';
import type { GraphEdge } from '../model/types';
import { MIN_NODE_DIAMETER } from './legibility';

/*
 * A child with several parent pairs in the family tree (docs/dev/05 §5.8): which pair stands
 * nearest the child, and where on top of the child each pair's line docks. Pure.
 */

/** A parent link's kind; a line that carries none is biological. */
export const parentKindOf = (edge: GraphEdge): ParentKind =>
	edge.parentKind ?? BIOLOGICAL_PARENT_KIND;

/**
 * How near the child a pair's drop stands, nearest first: the family the child lives or grew up
 * with (adoptive, current foster), then the biological parents, a step-parent, an ended foster.
 */
export function pairRank(edge: GraphEdge): number {
	switch (parentKindOf(edge)) {
		case 'adoptive':
			return 0;
		case 'foster':
			return edge.former ? 3 : 0;
		case 'biological':
			return 1;
		case 'step':
			return 2;
	}
}

/** Between two docks on top of one child, in model units, while the smallest disc has room. */
export const DOCK_SPREAD = 12;
/** How far off the centre a dock may sit: inside the rim of the smallest disc. */
const DOCK_REACH = (MIN_NODE_DIAMETER / 2) * 0.8;

/** Where each of a child's `count` bars docks on top of it, as offsets from its centre, left first. */
export function dockOffsets(count: number): number[] {
	if (count <= 1) return [0];
	const step = Math.min(DOCK_SPREAD, (2 * DOCK_REACH) / (count - 1));
	return Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * step);
}

/** How far above a disc's centre a line docking `offset` off it meets the smallest disc's rim. */
export function dockRise(offset: number): number {
	const radius = MIN_NODE_DIAMETER / 2;
	return Math.sqrt(radius * radius - offset * offset);
}

/** One child's place on a bar, as `pairOrderBreaks` reads it. */
export interface Hanging {
	child: string;
	/** The x of the child. */
	at: number;
	/** The x the bar's drop leaves from. */
	drop: number;
	rank: number;
}

/**
 * How often a child's pair stands farther from the child than a pair that should stand
 * farther out (`pairRank`): the tree's search keeps the family the child lives with nearest.
 */
export function pairOrderBreaks(hangings: readonly Hanging[]): number {
	const byChild = new Map<string, Hanging[]>();
	for (const h of hangings) byChild.set(h.child, [...(byChild.get(h.child) ?? []), h]);
	let breaks = 0;
	for (const pairs of byChild.values()) {
		for (const a of pairs) {
			for (const b of pairs) {
				if (a.rank < b.rank && Math.abs(a.drop - a.at) > Math.abs(b.drop - b.at)) breaks++;
			}
		}
	}
	return breaks;
}
