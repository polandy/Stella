import {
	buildEgoNetwork,
	expandNode,
	rebuildExplored,
	rolesOpenAfter,
	type CircleRole
} from '$lib/graph/model/ego-network';
import { emptyModel, mergeModels } from '$lib/graph/model/graph-model';
import type { GraphDataSource, GraphModel } from '$lib/graph/model/types';

/** What the reader has opened up of the graph, and how to open up more of it. */
export interface ExploredMap {
	readonly model: GraphModel;
	/** The ego view around the centre, the map's first ring. */
	open(centerId: string): Promise<void>;
	/** Adds what a traced chain brought in. */
	merge(found: GraphModel): void;
	/**
	 * Opens up a node's neighbours; for a circle, only the `roles` chosen of `all` it has, or the
	 * whole circle without them.
	 */
	expand(
		id: string,
		roles?: { chosen: ReadonlySet<CircleRole>; all: ReadonlySet<CircleRole> }
	): Promise<void>;
	/** Brings somebody found by name onto the map with their first ring, unless already there. */
	reveal(id: string): Promise<void>;
	/** Explores a fresh snapshot to the same extent; hands back who is on the map then. */
	rebuild(centerId: string): Promise<Set<string>>;
}

/*
 * The explored model of the explorer (docs/02 §2.7). All exploration runs against the in-memory
 * source — no further requests to the server. Called while a component initialises, since the
 * model is state; `source` is read on every step, so a fresh snapshot is followed.
 */
export function exploredMap(source: () => GraphDataSource): ExploredMap {
	// Starts empty; the ego view around the centre is built client-side on mount.
	let model = $state<GraphModel>(emptyModel());
	/*
	 * What the reader has opened up, in the order they did it. Kept so a fresh snapshot can be
	 * explored to the same extent instead of collapsing the map back to the first ring.
	 */
	let expandedIds = new Set<string>();
	/** For a circle opened up for some roles only, which — so a resync reopens it the same way. */
	const expandedRoles = new Map<string, ReadonlySet<CircleRole>>();

	return {
		get model() {
			return model;
		},
		async open(centerId) {
			model = await buildEgoNetwork(source(), centerId, 1);
		},
		merge(found) {
			model = mergeModels(model, found);
		},
		async expand(id, roles) {
			model = await expandNode(source(), model, id, roles?.chosen);
			if (roles) {
				const open = rolesOpenAfter(
					expandedIds.has(id),
					expandedRoles.get(id),
					roles.chosen,
					roles.all
				);
				if (open) expandedRoles.set(id, open);
				else expandedRoles.delete(id);
			}
			expandedIds.add(id);
		},
		async reveal(id) {
			if (model.nodes.some((n) => n.id === id)) return;
			model = mergeModels(model, await buildEgoNetwork(source(), id, 1));
			expandedIds.add(id);
		},
		async rebuild(centerId) {
			model = await rebuildExplored(source(), centerId, expandedIds, 1, expandedRoles);
			const nodeIds = new Set(model.nodes.map((n) => n.id));
			expandedIds = new Set([...expandedIds].filter((id) => nodeIds.has(id)));
			return nodeIds;
		}
	};
}
