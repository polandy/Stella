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
