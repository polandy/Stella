import { applyFilters } from './graph-model';
import type { GraphFilters, GraphModel } from './types';

/**
 * Whether expanding `nodeId` would put anything new on the map `shown` under `filters`: a
 * person or circle it is linked to that the map does not hold yet (its "+N"), or a line of it
 * between people the map already shows but does not draw. The peek panel offers *Expand*
 * exactly then (docs/02 §2.7) — the "+N" alone missed the second case, so a circle whose
 * members were all on the map could never have its roles drawn; a bare "any undrawn link"
 * offered a button the filters made do nothing.
 */
export function expandWouldAdd(
	graph: GraphModel,
	shown: GraphModel,
	nodeId: string,
	filters: GraphFilters = {}
): boolean {
	const reachable = applyFilters(graph, { ...filters, dropOrphans: false });
	const inGraph = new Set(graph.nodes.map((node) => node.id));
	const drawn = new Set(shown.edges.map((edge) => edge.id));
	return reachable.edges.some(
		(edge) =>
			edge.source !== edge.target &&
			(edge.source === nodeId || edge.target === nodeId) &&
			inGraph.has(edge.source) &&
			inGraph.has(edge.target) &&
			!drawn.has(edge.id)
	);
}
