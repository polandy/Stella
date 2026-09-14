import { emptyModel, mergeModels } from './graph-model';
import type { GraphDataSource, GraphModel, Neighborhood } from './types';

/*
 * Ego-network builders (docs/04 §4.11, docs/02 §2.7). These grow a GraphModel hop by hop
 * through the GraphDataSource port; the port applies visibility scoping, so only nodes and
 * edges the viewer may see ever enter the model. Pure otherwise — deterministic given a source.
 */

function absorb(model: GraphModel, hood: Neighborhood): GraphModel {
	return mergeModels(model, { nodes: [hood.center, ...hood.nodes], edges: hood.edges });
}

/**
 * Build the network centred on `centerId` out to `depth` hops. `depth` 1 yields the centre
 * plus its immediate relationships and circles; higher
 * depths fetch each frontier node's neighbourhood in turn. Nodes discovered at the final hop
 * are included, but their onward edges are not — that is what {@link expandNode} is for.
 * An unknown or invisible centre yields an empty model.
 */
export async function buildEgoNetwork(
	source: GraphDataSource,
	centerId: string,
	depth = 1
): Promise<GraphModel> {
	const center = await source.neighborhood(centerId);
	if (!center) return emptyModel();
	if (depth < 1) {
		return { nodes: [center.center], edges: [] };
	}

	let model = emptyModel();
	const visited = new Set<string>();
	let frontier = [centerId];

	for (let level = 0; level < depth && frontier.length > 0; level++) {
		const next: string[] = [];
		for (const id of frontier) {
			if (visited.has(id)) continue;
			visited.add(id);
			const hood = id === centerId ? center : await source.neighborhood(id);
			if (!hood) continue;
			model = absorb(model, hood);
			for (const n of hood.nodes) {
				if (!visited.has(n.id)) next.push(n.id);
			}
		}
		frontier = next;
	}
	return model;
}

/**
 * Expand one node in place: fetch its neighbourhood and merge it into `model`, revealing that
 * node's relationships and circles without disturbing the rest. Unknown/invisible nodes leave
 * the model unchanged. Returns a new model (the input is not mutated).
 */
export async function expandNode(
	source: GraphDataSource,
	model: GraphModel,
	nodeId: string
): Promise<GraphModel> {
	const hood = await source.neighborhood(nodeId);
	if (!hood) return model;
	return absorb(model, hood);
}

/**
 * Rebuild an explored model against a fresh snapshot of the graph: the ego network around
 * `centerId` out to `depth`, plus the neighbourhood of every node in `expandedIds` the
 * rebuilt model actually reaches — in the order the reader expanded them, so an expansion
 * that only a previous one revealed is applied too. A node the new snapshot no longer
 * reaches from the centre is skipped rather than merged in as an island.
 *
 * This is what lets a map already on screen follow a save (a new relationship, a corrected
 * one) without throwing away what its reader had opened up.
 */
export async function rebuildExplored(
	source: GraphDataSource,
	centerId: string,
	expandedIds: Iterable<string>,
	depth = 1
): Promise<GraphModel> {
	let model = await buildEgoNetwork(source, centerId, depth);
	for (const id of expandedIds) {
		if (!model.nodes.some((n) => n.id === id)) continue;
		model = await expandNode(source, model, id);
	}
	return model;
}
