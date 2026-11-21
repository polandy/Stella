import { looseAnchor, looseVia } from '../model/loose-relatives';
import type { GraphEdge } from '../model/types';
import type { RowSpacing } from './family-rows';
import type { SizeOf } from './geometry';

/*
 * Where the family tree stands its loose relatives (docs/dev/05 §5.8, `loose-relatives.ts`):
 * once the rest of the family is placed, at the ends of their rows. Pure.
 */

/**
 * Sets each loose relative at the end of their row, a family's distance past whoever stands
 * there: on the side of the parent their line runs through, else on the right. Those tied to one
 * person stand together.
 */
export function atRowEnds(
	x: Map<string, number>,
	loose: ReadonlySet<string>,
	everyone: ReadonlyMap<string, number>,
	edges: readonly GraphEdge[],
	sizeOf: SizeOf,
	spacing: RowSpacing
): void {
	if (loose.size === 0) return;
	const onTree = new Set(x.keys());
	const xs = [...x.values()];
	const middle = xs.length > 0 ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
	const members = new Set(everyone.keys());
	const anchor = new Map(
		[...loose].map((id) => [id, looseAnchor(id, edges, members, loose) ?? ''])
	);
	const ordered = [...loose].sort((a, b) => anchor.get(a)!.localeCompare(anchor.get(b)!));
	for (const generation of new Set([...loose].map((id) => everyone.get(id)!))) {
		const row = [...onTree].filter((id) => everyone.get(id) === generation);
		// Past the outermost name on that side, or either side of the middle on a row of none.
		const edge = (side: 1 | -1) =>
			row.length === 0
				? middle + (side * spacing.gap) / 2
				: side *
					(Math.max(...row.map((id) => side * x.get(id)! + sizeOf(id).width / 2)) + spacing.family);
		for (const side of [1, -1] as const) {
			const group = ordered.filter((id) => {
				if (everyone.get(id) !== generation) return false;
				const via = looseVia(id, edges, onTree);
				return (via !== undefined && x.get(via)! < middle ? -1 : 1) === side;
			});
			let cursor = edge(side);
			for (const id of side === 1 ? group : [...group].reverse()) {
				const width = sizeOf(id).width;
				x.set(id, cursor + (side * width) / 2);
				cursor += side * (width + spacing.gap);
			}
		}
	}
}
