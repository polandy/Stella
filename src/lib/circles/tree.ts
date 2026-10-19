/*
 * The nesting of circles (docs/02 §2.4.2), built once in memory from one flat read and asked by
 * every screen that shows it: the list's families, a circle's breadcrumb, its siblings and its
 * sub-circles. Pure and client-safe.
 *
 * The import refuses a loop (ADR-125), but a page must not hang on bad data either: a loop is
 * cut where the tree is built, and every walk still keeps its own visited set.
 */

import type { Accent } from '$lib/design/tokens';

/** A circle as the tree knows it — already scoped to the reader by the access layer. */
export interface TreeCircle {
	id: string;
	/** Its parent, when the reader may see the parent too; null on top. */
	parentId: string | null;
	name: string;
	description: string | null;
	kind: string;
	color: Accent;
	startDate: string | null;
	endDate: string | null;
	visibility: 'shared' | 'private';
	/** Its own visible members — never its sub-circles'. */
	memberCount: number;
	/** Its private sub-circles the reader may not see: counted, never named. */
	hiddenChildCount: number;
}

/** The siblings on either side of a circle, as its page steps to them. */
export interface Neighbours<T> {
	previous: T | null;
	next: T | null;
}

/** The nesting, asked by id. Unknown ids answer as a circle without relatives. */
export interface CircleTree<T extends TreeCircle> {
	get(id: string): T | undefined;
	/** The circles without a (visible) parent, in chronological order. */
	topLevel(): T[];
	/** The direct sub-circles the reader sees, newest first (display order). */
	children(id: string): T[];
	/** Every sub-circle below, at any depth, each family newest first (depth first). */
	descendants(id: string): T[];
	/** The way up, from the top-level circle down to the parent. */
	ancestors(id: string): T[];
	/** The siblings before and after it in chronological order; none for a top-level circle. */
	neighbours(id: string): Neighbours<T>;
	/** Its direct sub-circles, the hidden ones included. */
	childCount(id: string): number;
}

/** A start date as a sortable day; a year alone is its January, a month its first. */
function startKey(date: string): string {
	const [year, month = '01', day = '01'] = date.split('-');
	return `${year}-${month}-${day}`;
}

/** An end date as its last possible day, sortable against a full date. */
function endKey(date: string): string {
	// 31 is past every month's last day, which is all a string comparison needs.
	const [year, month = '12', day = '31'] = date.split('-');
	return `${year}-${month}-${day}`;
}

type Ordered = Pick<TreeCircle, 'name' | 'startDate' | 'endDate'>;

/**
 * Chronological order: by period start, undated last, then by name. The top level runs in it,
 * and so do a sub-circle's *previous* and *next* steps, which follow the time axis.
 */
export function compareChronological(a: Ordered, b: Ordered): number {
	if (a.startDate !== b.startDate) {
		if (a.startDate === null) return 1;
		if (b.startDate === null) return -1;
		const byStart = startKey(a.startDate).localeCompare(startKey(b.startDate));
		if (byStart !== 0) return byStart;
	}
	return a.name.localeCompare(b.name);
}

/**
 * Display order of a list of sub-circles: the newest period first — by start, then by the later
 * end, a period without an end counting as the latest — undated last, ties by name.
 */
export function compareNewestFirst(a: Ordered, b: Ordered): number {
	if (a.startDate !== b.startDate) {
		if (a.startDate === null) return 1;
		if (b.startDate === null) return -1;
		const byStart = startKey(b.startDate).localeCompare(startKey(a.startDate));
		if (byStart !== 0) return byStart;
	}
	if (a.endDate !== b.endDate) {
		if (a.endDate === null) return -1;
		if (b.endDate === null) return 1;
		const byEnd = endKey(b.endDate).localeCompare(endKey(a.endDate));
		if (byEnd !== 0) return byEnd;
	}
	return a.name.localeCompare(b.name);
}

/** Whether a circle is over: its end, read as its last day, lies before `today` (YYYY-MM-DD). */
export function isPastCircle(circle: Pick<TreeCircle, 'endDate'>, today: string): boolean {
	return circle.endDate !== null && endKey(circle.endDate) < today;
}

/**
 * Each circle's parent as the tree uses it: only parents that are there, and with every loop
 * cut at its smallest id, so walking up always ends.
 */
function acyclicParents(circles: readonly TreeCircle[]): Map<string, string> {
	const parents = new Map<string, string>();
	const present = new Set(circles.map((c) => c.id));
	for (const c of circles)
		if (c.parentId !== null && present.has(c.parentId)) parents.set(c.id, c.parentId);

	for (const start of circles) {
		const path: string[] = [];
		const onPath = new Set<string>();
		let current: string | undefined = start.id;
		while (current !== undefined && !onPath.has(current)) {
			onPath.add(current);
			path.push(current);
			current = parents.get(current);
		}
		if (current === undefined) continue;
		const loop = path.slice(path.indexOf(current));
		const cut = loop.reduce((min, id) => (id < min ? id : min));
		parents.delete(cut);
	}
	return parents;
}

/** Builds the nesting of `circles`, which the access layer has already scoped to the reader. */
export function circleTree<T extends TreeCircle>(circles: readonly T[]): CircleTree<T> {
	const byId = new Map(circles.map((c) => [c.id, c]));
	const parents = acyclicParents(circles);
	const childrenOf = new Map<string, T[]>();
	const roots: T[] = [];
	for (const c of circles) {
		const parentId = parents.get(c.id);
		if (parentId === undefined) roots.push(c);
		else childrenOf.set(parentId, [...(childrenOf.get(parentId) ?? []), c]);
	}
	roots.sort(compareChronological);
	for (const list of childrenOf.values()) list.sort(compareNewestFirst);

	const children = (id: string): T[] => childrenOf.get(id) ?? [];

	return {
		get: (id) => byId.get(id),
		topLevel: () => [...roots],
		children: (id) => [...children(id)],
		descendants(id) {
			const found: T[] = [];
			const seen = new Set<string>([id]);
			const visit = (parentId: string) => {
				for (const child of children(parentId)) {
					if (seen.has(child.id)) continue;
					seen.add(child.id);
					found.push(child);
					visit(child.id);
				}
			};
			visit(id);
			return found;
		},
		ancestors(id) {
			const way: T[] = [];
			const seen = new Set<string>([id]);
			let parentId = parents.get(id);
			while (parentId !== undefined && !seen.has(parentId)) {
				seen.add(parentId);
				const parent = byId.get(parentId);
				if (!parent) break;
				way.unshift(parent);
				parentId = parents.get(parentId);
			}
			return way;
		},
		neighbours(id) {
			const parentId = parents.get(id);
			if (parentId === undefined) return { previous: null, next: null };
			const siblings = children(parentId).toSorted(compareChronological);
			const at = siblings.findIndex((c) => c.id === id);
			return { previous: siblings[at - 1] ?? null, next: siblings[at + 1] ?? null };
		},
		childCount: (id) => children(id).length + (byId.get(id)?.hiddenChildCount ?? 0)
	};
}
