import { buildEgoNetwork } from './ego-network';
import { inMemoryGraphSource } from './in-memory-source';
import type { GraphModel } from './types';

/*
 * The slice of the household's graph that a person's page carries (docs/05 §5.5, docs/02 §2.7).
 *
 * The full explorer route ships the whole visible graph, because wandering is what it is for.
 * A profile is about one person, so it ships their neighbourhood and their neighbours'
 * neighbourhood — enough to answer "and who is that?" without a round-trip, and enough that
 * the map cannot be walked into the whole household. Everything past it is a click on
 * "Open in the graph".
 */

/** How far the map on a person's page reaches, in hops from that person. */
export const PERSON_MAP_RINGS = 2;

/**
 * The person's own slice of an already access-scoped snapshot. Nodes on the outermost ring are
 * included, their onward links are not — the explorer asks for those when a reader expands.
 * A centre the snapshot does not hold (unknown, or not visible to this viewer) yields an empty
 * model rather than a stranger's neighbourhood.
 */
export function personMap(graph: GraphModel, centerId: string): Promise<GraphModel> {
	return buildEgoNetwork(inMemoryGraphSource(graph), centerId, PERSON_MAP_RINGS);
}

/**
 * The people `centerId` is joined to by former links alone — an ex-partner with no tie left
 * that is current. The People card's preview draws their line dashed, as the map does
 * (docs/05 §5.8); a person with a current link beside a former one keeps a solid line.
 */
export function formerOnlyNeighbours(graph: GraphModel, centerId: string): Set<string> {
	const former = new Set<string>();
	const current = new Set<string>();
	for (const e of graph.edges) {
		if (e.kind !== 'relationship') continue;
		const other = e.source === centerId ? e.target : e.target === centerId ? e.source : null;
		if (other) (e.former ? former : current).add(other);
	}
	return new Set([...former].filter((id) => !current.has(id)));
}
