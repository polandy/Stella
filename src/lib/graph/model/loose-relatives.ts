import {
	COUSIN_TYPE_KEY,
	PARENT_CHILD_TYPE_KEY,
	PARTNER_TYPE_KEYS,
	SIBLING_TYPE_KEY
} from '../../relationships/type-keys';
import { isFamilyLink, isSameGenerationLink } from './generations';
import type { GraphEdge } from './types';

/*
 * Relatives the family tree has no bar for (docs/dev/05 §5.8). Pure. A cousin entered straight
 * onto somebody, with no aunt or uncle on record, stands on a row without a parent's line or a
 * partner's to hang from — and the line along the row to them would read as a siblings' bar. So
 * the tree stands such loose relatives at the end of their row and draws their line only while
 * one end is selected.
 */

/** Siblings share a bar, so a sibling line along the row is the one the tree keeps. */
export function isSiblingLine(edge: GraphEdge): boolean {
	return edge.typeKey === SIBLING_TYPE_KEY || edge.kin?.term === 'sibling';
}

/** A cousin's line: the gap it shows is an aunt or uncle nobody entered. */
export function isCousinLine(edge: GraphEdge): boolean {
	return edge.typeKey === COUSIN_TYPE_KEY || edge.kin?.term === 'cousin';
}

const isBarLine = (edge: GraphEdge) =>
	edge.typeKey === PARENT_CHILD_TYPE_KEY ||
	(edge.typeKey !== undefined && PARTNER_TYPE_KEYS.includes(edge.typeKey));

/** A family line along one generation the tree never draws over the row: no sibling's or partner's. */
export function isLooseLine(edge: GraphEdge): boolean {
	return isSameGenerationLink(edge) && !isSiblingLine(edge) && !isBarLine(edge);
}

/**
 * The members of one family with no bar to hang from: neither a parent's line, a partner's nor a
 * sibling's ties them to anybody who has one, and every family line they have runs along their
 * generation. Nobody is loose in a family where nobody hangs from a bar.
 */
export function looseRelatives(
	members: ReadonlySet<string>,
	edges: readonly GraphEdge[]
): Set<string> {
	const among = edges.filter(
		(e) => e.source !== e.target && members.has(e.source) && members.has(e.target)
	);
	const anchored = new Set(among.filter(isBarLine).flatMap((e) => [e.source, e.target] as const));
	if (anchored.size === 0) return new Set();
	for (let grew = true; grew;) {
		grew = false;
		for (const e of among.filter(isSiblingLine)) {
			const [a, b] = [anchored.has(e.source), anchored.has(e.target)];
			if (a === b) continue;
			anchored.add(a ? e.target : e.source);
			grew = true;
		}
	}
	const loose = new Set<string>();
	for (const id of members) {
		if (anchored.has(id)) continue;
		const own = among.filter((e) => (e.source === id || e.target === id) && isFamilyLink(e));
		if (own.length > 0 && own.every(isSameGenerationLink)) loose.add(id);
	}
	return loose;
}

/**
 * Whom a loose relative is tied to the tree through: the first person a worked-out line names
 * who is on the tree and not loose — the parent a cousin is related through. None for a line
 * entered by hand, which says no more than the pair.
 */
export function looseVia(
	id: string,
	edges: readonly GraphEdge[],
	onTree: ReadonlySet<string>
): string | undefined {
	for (const e of edges) {
		if (e.source !== id && e.target !== id) continue;
		const through = e.kin?.via?.find((v) => onTree.has(v));
		if (through) return through;
	}
	return undefined;
}

/** The first member a loose relative's lines lead to who is not loose: whose relative they are. */
export function looseAnchor(
	id: string,
	edges: readonly GraphEdge[],
	members: ReadonlySet<string>,
	loose: ReadonlySet<string>
): string | undefined {
	for (const e of edges) {
		const other = e.source === id ? e.target : e.target === id ? e.source : undefined;
		if (other && members.has(other) && !loose.has(other) && isFamilyLink(e)) return other;
	}
	return undefined;
}
