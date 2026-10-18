import type { TreeCircle } from '../../circles/tree';
import { canViewCircle, type Viewer } from './visibility';

/*
 * The circle nesting as one reader may see it (docs/02 §2.4.2, §3.7). The nesting is read for
 * the whole household in one go, so the visibility rule runs here, on the rows, rather than in
 * the query: a hidden circle still has to be counted under a parent the reader sees.
 */

/** One circle of the household as the tree's read takes it, before any scoping. */
export interface CircleTreeRow extends Omit<TreeCircle, 'hiddenChildCount'> {
	householdId: string;
	createdBy: string;
}

/**
 * The circles `viewer` may see, each with its parent only when that is visible too and with its
 * hidden private sub-circles counted. Nothing else of a hidden circle leaves this function.
 */
export function circleTreeVisibleTo(viewer: Viewer, rows: readonly CircleTreeRow[]): TreeCircle[] {
	const visible = new Set(
		rows
			.filter((r) =>
				canViewCircle(viewer, {
					householdId: r.householdId,
					ownerId: r.createdBy,
					visibility: r.visibility
				})
			)
			.map((r) => r.id)
	);
	const hiddenChildren = new Map<string, number>();
	for (const r of rows) {
		if (visible.has(r.id) || r.parentId === null || !visible.has(r.parentId)) continue;
		hiddenChildren.set(r.parentId, (hiddenChildren.get(r.parentId) ?? 0) + 1);
	}
	return rows
		.filter((r) => visible.has(r.id))
		.map(({ householdId: _household, createdBy: _owner, ...circle }) => ({
			...circle,
			parentId: circle.parentId !== null && visible.has(circle.parentId) ? circle.parentId : null,
			hiddenChildCount: hiddenChildren.get(circle.id) ?? 0
		}));
}
