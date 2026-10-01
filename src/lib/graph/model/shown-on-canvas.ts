import type { RoleGrouping } from './role-groups';
import type { GraphModel } from './types';

/** The node and edge ids the canvas shows; the rest of what it holds is hidden, not removed. */
export interface ShownIds {
	nodes: Set<string>;
	edges: Set<string>;
}

/**
 * What the canvas shows: the filtered map, less the derived lines `implied` by a chain already
 * drawn, plus the frames and bundles grouping adds (docs/05 §5.8).
 */
export function shownOnCanvas(
	drawnVisible: GraphModel,
	implied: ReadonlySet<string>,
	grouping: RoleGrouping | null
): ShownIds {
	return {
		nodes: new Set([
			...drawnVisible.nodes.map((n) => n.id),
			...(grouping?.groups.map((g) => g.id) ?? [])
		]),
		edges: new Set([
			...drawnVisible.edges.filter((e) => !implied.has(e.id)).map((e) => e.id),
			...(grouping?.bundles.map((b) => b.id) ?? [])
		])
	};
}
