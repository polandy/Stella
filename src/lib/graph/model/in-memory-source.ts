import type { GraphDataSource, GraphEdge, GraphModel, GraphNode, Neighborhood } from './types';

/*
 * A GraphDataSource backed by an in-memory GraphModel (docs/04 §4.11). This is the key to
 * running the explorer entirely in the browser: the server delivers one slim, access-scoped
 * snapshot of the visible graph, the client wraps it here, and the isomorphic builders
 * (buildEgoNetwork / expandNode / findConnectionPath) then explore it with zero further
 * requests. Incident edges are indexed once so repeated expansion stays cheap.
 */
export function inMemoryGraphSource(model: GraphModel): GraphDataSource {
	const nodeById = new Map<string, GraphNode>(model.nodes.map((n) => [n.id, n]));

	const incident = new Map<string, GraphEdge[]>();
	const add = (nodeId: string, edge: GraphEdge) => {
		const list = incident.get(nodeId);
		if (list) list.push(edge);
		else incident.set(nodeId, [edge]);
	};
	for (const edge of model.edges) {
		if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
		add(edge.source, edge);
		if (edge.target !== edge.source) add(edge.target, edge);
	}

	return {
		async neighborhood(nodeId: string): Promise<Neighborhood | null> {
			const center = nodeById.get(nodeId);
			if (!center) return null;
			const edges = incident.get(nodeId) ?? [];
			const neighborIds = new Set(edges.map((e) => (e.source === nodeId ? e.target : e.source)));
			const nodes = [...neighborIds]
				.map((id) => nodeById.get(id))
				.filter((n): n is GraphNode => n !== undefined);
			return { center, nodes, edges: [...edges] };
		}
	};
}
