import { familiesOf, isFamilyLink } from './generations';
import { roleBy, rolesTowards, type TreeRole } from './tree-roles';
import type { GraphEdge, GraphModel } from './types';

/*
 * What the family tree writes under the people and circles on its "Outside the family" shelf
 * (docs/05 §5.8). Pure. The shelf stands without lines, so each one says who they are:
 *
 * - somebody tied to the centre has their role already (`tree-roles.ts`) and needs nothing more;
 * - anybody else says what they are to the person on the map they hang off — "Friend of
 *   Sandra" — read from the far end like the role, and "+N" for the others they hang off;
 * - a circle names the people on the map in it, two at most and "+N" for the rest.
 *
 * Who comes first is the person closest to the centre: the centre itself, then the family by
 * how many family lines away from the centre they stand, then anybody else; ties by name.
 */

/** The words a household's own type has, read from the shelf person's end. */
export interface TieWords {
	label: string;
}

export type ShelfCaption =
	| { kind: 'tie'; role: TreeRole | TieWords; anchor: string; more: number }
	| { kind: 'members'; ids: string[]; more: number };

/** The most people a circle names before the rest become "+N": two names still fit a pill. */
export const MEMBERS_NAMED = 2;

/**
 * The caption of everybody on the shelf of `onMap` that has one, keyed by id. Ties are read
 * from the whole `snapshot`; only people on the map are named.
 */
export function shelfCaptions(
	snapshot: GraphModel,
	onMap: GraphModel,
	centerId: string
): Map<string, ShelfCaption> {
	const shown = new Map(onMap.nodes.map((n) => [n.id, n]));
	const family = new Set(familiesOf(onMap).flatMap((f) => [...f.keys()]));
	const hasRole = rolesTowards(snapshot, centerId);

	// How many family lines away from the centre each of the family stands.
	const distance = new Map<string, number>([[centerId, 0]]);
	let frontier = [centerId];
	while (frontier.length > 0) {
		const next: string[] = [];
		for (const id of frontier) {
			for (const e of onMap.edges) {
				if (!isFamilyLink(e) || (e.source !== id && e.target !== id)) continue;
				const other = e.source === id ? e.target : e.source;
				if (distance.has(other)) continue;
				distance.set(other, distance.get(id)! + 1);
				next.push(other);
			}
		}
		frontier = next;
	}
	const nameOf = (id: string) => shown.get(id)?.shortName ?? shown.get(id)?.label ?? id;
	/** Closest to the centre first: the centre, the family by distance, anybody else; by name. */
	const closest = (a: string, b: string) => {
		const rank = (id: string) =>
			id === centerId ? 0 : family.has(id) ? 1 + (distance.get(id) ?? Infinity) : Infinity;
		return rank(a) - rank(b) || nameOf(a).localeCompare(nameOf(b)) || (a < b ? -1 : 1);
	};

	const captions = new Map<string, ShelfCaption>();
	for (const node of onMap.nodes) {
		if (family.has(node.id) || node.id === centerId) continue;
		if (node.kind === 'circle') {
			const members = snapshot.edges
				.filter((e) => e.kind === 'membership' && e.source === node.id && shown.has(e.target))
				.map((e) => e.target)
				.sort(closest);
			if (members.length === 0) continue;
			captions.set(node.id, {
				kind: 'members',
				ids: members.slice(0, MEMBERS_NAMED),
				more: Math.max(0, members.length - MEMBERS_NAMED)
			});
			continue;
		}
		if (hasRole.has(node.id)) continue;

		const ties = new Map<string, TreeRole | TieWords>();
		for (const edge of snapshot.edges) {
			if (edge.kind === 'membership') continue;
			const anchor =
				edge.source === node.id ? edge.target : edge.target === node.id ? edge.source : null;
			if (anchor === null || anchor === node.id || shown.get(anchor)?.kind !== 'person') continue;
			const words = wordsFor(edge, anchor, node.id, node.wording ?? 'neutral');
			if (words && !ties.has(anchor)) ties.set(anchor, words);
		}
		const anchors = [...ties.keys()].sort(closest);
		if (anchors.length === 0) continue;
		captions.set(node.id, {
			kind: 'tie',
			role: ties.get(anchors[0])!,
			anchor: anchors[0],
			more: anchors.length - 1
		});
	}
	return captions;
}

/**
 * What the shelf person is to `anchor` by this line: a built-in tie's role read from the far end,
 * or a household's own type's words where they read from the shelf person ("Godparent of").
 */
function wordsFor(
	edge: GraphEdge,
	anchor: string,
	shelfPerson: string,
	wording: NonNullable<GraphModel['nodes'][number]['wording']>
): TreeRole | TieWords | null {
	const role = roleBy(edge, anchor, wording);
	if (role) return role;
	if (edge.kind === 'relationship' && edge.source === shelfPerson && edge.label) {
		return { label: edge.label };
	}
	return null;
}
