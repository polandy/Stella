import type { GraphModel } from './types';

/*
 * How far each node sits from the centre, counted in hops (docs/02 §2.7).
 *
 * The map embedded in a person's page is theirs: it shows their people and their people's
 * people, and stops. Without a distance the embedded explorer could be walked hop by hop into
 * the whole household, which is what the full graph route is for. Pure over an already-loaded
 * model — no source, no fetching.
 */

/**
 * Hop distance from `centerId` for every node reachable from it, the centre itself at 0.
 * Nodes the centre cannot reach are absent rather than at infinity, so a caller reads a
 * missing entry as "not part of this map". An unknown centre yields an empty map.
 */
export function ringsFrom(model: GraphModel, centerId: string): Map<string, number> {
	const rings = new Map<string, number>();
	if (!model.nodes.some((node) => node.id === centerId)) return rings;

	const neighbours = new Map<string, string[]>();
	const link = (from: string, to: string) => {
		const list = neighbours.get(from);
		if (list) list.push(to);
		else neighbours.set(from, [to]);
	};
	for (const edge of model.edges) {
		link(edge.source, edge.target);
		if (edge.source !== edge.target) link(edge.target, edge.source);
	}

	rings.set(centerId, 0);
	let frontier = [centerId];
	for (let ring = 1; frontier.length > 0; ring++) {
		const next: string[] = [];
		for (const id of frontier) {
			for (const neighbour of neighbours.get(id) ?? []) {
				if (rings.has(neighbour)) continue;
				rings.set(neighbour, ring);
				next.push(neighbour);
			}
		}
		frontier = next;
	}
	return rings;
}

/**
 * Whether expanding this node would stay inside a map of `maxRings` hops. A node on the last
 * ring is not expandable: its neighbours would sit one ring further out than the map promises.
 * A node the centre cannot reach is never expandable — it is not part of this map.
 */
export function canExpand(
	rings: ReadonlyMap<string, number>,
	nodeId: string,
	maxRings: number
): boolean {
	const ring = rings.get(nodeId);
	return ring !== undefined && ring < maxRings;
}
