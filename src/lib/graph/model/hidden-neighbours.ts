import { applyFilters } from './graph-model';
import type { GraphFilters, GraphModel } from './types';

/*
 * How many people (or circles) expanding a node would bring onto the map (docs/05 §5.8) — the
 * count behind the "+N" a node wears while it can still grow. Pure over the snapshot the
 * explorer already holds, so it costs no request and tests without a canvas.
 */

export interface HiddenNeighbourOptions {
	/**
	 * What the map currently lets through. A neighbour reached only by a line the filters hide
	 * would not appear on an expand, so it is not promised either.
	 */
	filters?: GraphFilters;
	/** Whether the map may expand a node at all — the embedded map stops at its last ring. */
	expandable?: (nodeId: string) => boolean;
}

/**
 * For every node `shown`, the number of distinct neighbours `graph` links it to that `shown`
 * does not hold. Nodes with none (or that may not be expanded) are absent, so a caller reads a
 * missing entry as "nothing more here".
 */
export function hiddenNeighbourCounts(
	graph: GraphModel,
	shown: GraphModel,
	options: HiddenNeighbourOptions = {}
): Map<string, number> {
	const reachable = options.filters
		? applyFilters(graph, { ...options.filters, dropOrphans: false })
		: graph;
	const inGraph = new Set(graph.nodes.map((n) => n.id));
	const onMap = new Set(shown.nodes.map((n) => n.id));
	const expandable = options.expandable ?? (() => true);

	const hidden = new Map<string, Set<string>>();
	const note = (from: string, to: string) => {
		if (!onMap.has(from) || onMap.has(to) || !inGraph.has(to)) return;
		const set = hidden.get(from);
		if (set) set.add(to);
		else hidden.set(from, new Set([to]));
	};
	for (const edge of reachable.edges) {
		if (edge.source === edge.target) continue;
		note(edge.source, edge.target);
		note(edge.target, edge.source);
	}

	const counts = new Map<string, number>();
	for (const [id, neighbours] of hidden) {
		if (expandable(id)) counts.set(id, neighbours.size);
	}
	return counts;
}
