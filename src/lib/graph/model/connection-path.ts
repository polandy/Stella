import type { ConnectionPath, GraphDataSource, GraphEdge, GraphNode } from './types';

/*
 * findConnectionPath (docs/02 §2.7): the shortest chain linking two people through
 * relationships and circle co-membership — "how do we know each other?". Breadth-first over
 * the GraphDataSource port (so the first path found is a shortest one), returning exactly the
 * ordered nodes and connecting edges of that chain. Bounded by `maxDepth` for large graphs.
 */

export async function findConnectionPath(
	source: GraphDataSource,
	fromId: string,
	toId: string,
	maxDepth = 6
): Promise<ConnectionPath | null> {
	const start = await source.neighborhood(fromId);
	if (!start) return null;

	const nodeById = new Map<string, GraphNode>([[fromId, start.center]]);

	if (fromId === toId) {
		return { nodeIds: [fromId], model: { nodes: [start.center], edges: [] } };
	}

	// BFS, remembering the edge that first reached each node so the chain can be rebuilt.
	const cameFrom = new Map<string, { via: string; edge: GraphEdge }>();
	const visited = new Set<string>([fromId]);
	let frontier = [fromId];
	let found = false;

	search: for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
		const next: string[] = [];
		for (const id of frontier) {
			const hood = id === fromId ? start : await source.neighborhood(id);
			if (!hood) continue;
			for (const n of hood.nodes) {
				if (!nodeById.has(n.id)) nodeById.set(n.id, n);
			}
			for (const edge of hood.edges) {
				const neighbor = edge.source === id ? edge.target : edge.source;
				if (neighbor === id || visited.has(neighbor)) continue;
				visited.add(neighbor);
				cameFrom.set(neighbor, { via: id, edge });
				if (neighbor === toId) {
					found = true;
					break search;
				}
				next.push(neighbor);
			}
		}
		frontier = next;
	}

	if (!found) return null;

	// Walk predecessors back from the target, then reverse into source → target order.
	const nodeIds: string[] = [];
	const edges: GraphEdge[] = [];
	for (let cur = toId; cur !== fromId; ) {
		const step = cameFrom.get(cur)!;
		nodeIds.unshift(cur);
		edges.unshift(step.edge);
		cur = step.via;
	}
	nodeIds.unshift(fromId);

	const nodes = nodeIds.map((id) => nodeById.get(id)!);
	return { nodeIds, model: { nodes, edges } };
}
