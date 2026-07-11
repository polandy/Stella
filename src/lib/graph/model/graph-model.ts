import type { GraphEdge, GraphFilters, GraphModel, GraphNode } from './types';

/*
 * Pure value operations over GraphModel (docs/04 §4.11). Every function returns a fresh model
 * and never mutates its input, so the rendering adapter can treat models as immutable
 * snapshots and re-render from whatever a builder or filter returns.
 */

export function emptyModel(): GraphModel {
	return { nodes: [], edges: [] };
}

/** Merge `b` into `a`, deduplicating nodes and edges by id (first occurrence wins). */
export function mergeModels(a: GraphModel, b: GraphModel): GraphModel {
	const nodes = dedupeById([...a.nodes, ...b.nodes]);
	const edges = dedupeById([...a.edges, ...b.edges]);
	return { nodes, edges };
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
	const seen = new Set<string>();
	const out: T[] = [];
	for (const item of items) {
		if (seen.has(item.id)) continue;
		seen.add(item.id);
		out.push(item);
	}
	return out;
}

/** Undirected adjacency: node id → set of directly connected node ids. */
function adjacency(edges: GraphEdge[]): Map<string, Set<string>> {
	const adj = new Map<string, Set<string>>();
	const link = (from: string, to: string) => {
		(adj.get(from) ?? adj.set(from, new Set()).get(from)!).add(to);
	};
	for (const e of edges) {
		link(e.source, e.target);
		link(e.target, e.source);
	}
	return adj;
}

/** Distinct node ids directly connected to `nodeId`. */
export function neighborsOf(model: GraphModel, nodeId: string): Set<string> {
	return adjacency(model.edges).get(nodeId) ?? new Set();
}

/** Every node id reachable from `startId` (inclusive) through the model's edges. */
export function reachableFrom(model: GraphModel, startId: string): Set<string> {
	const adj = adjacency(model.edges);
	const seen = new Set<string>([startId]);
	const queue = [startId];
	while (queue.length) {
		const cur = queue.shift()!;
		for (const nb of adj.get(cur) ?? []) {
			if (!seen.has(nb)) {
				seen.add(nb);
				queue.push(nb);
			}
		}
	}
	return seen;
}

/**
 * Filter a model by edge kind and/or relationship category, then prune nodes the filtering
 * orphaned. With `keepNodeId`, pruning is by reachability from that centre (so a node left
 * hanging off a removed edge disappears too, matching the explorer's live re-layout); without
 * it, only edgeless nodes are dropped. `keepNodeId` itself is always retained.
 */
export function applyFilters(model: GraphModel, filters: GraphFilters): GraphModel {
	const kinds = filters.edgeKinds ? new Set(filters.edgeKinds) : null;
	const categories = filters.categories ? new Set(filters.categories) : null;

	const edges = model.edges.filter((e) => {
		if (kinds && !kinds.has(e.kind)) return false;
		if (categories && e.kind === 'relationship') {
			return e.category !== undefined && categories.has(e.category);
		}
		return true;
	});

	const dropOrphans = filters.dropOrphans ?? true;
	let nodes: GraphNode[] = model.nodes;
	if (dropOrphans) {
		if (filters.keepNodeId !== undefined) {
			const keep = reachableFrom({ nodes: model.nodes, edges }, filters.keepNodeId);
			nodes = model.nodes.filter((n) => keep.has(n.id));
		} else {
			const connected = new Set<string>();
			for (const e of edges) {
				connected.add(e.source);
				connected.add(e.target);
			}
			nodes = model.nodes.filter((n) => connected.has(n.id));
		}
	}

	const surviving = new Set(nodes.map((n) => n.id));
	const finalEdges = edges.filter((e) => surviving.has(e.source) && surviving.has(e.target));
	return { nodes, edges: finalEdges };
}
