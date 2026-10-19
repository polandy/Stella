import type { TreeCircle } from '../../../circles/tree';
import type { Viewer } from '../../access/visibility';

/*
 * The household's circle nesting (docs/02 §2.4.2) as the Circles list and a circle's page show
 * it: every circle the reader sees, with its visible parent, its direct member count and its
 * hidden sub-circles counted. A read model of its own (docs/08 §8.3), read in one query and built
 * into a tree in memory (`$lib/circles/tree`), so no card or row asks again.
 */

/** The circle nesting, read through the access layer. */
export interface CircleTreeReads {
	/** Every circle `viewer` may see, scoped by `circleTreeVisibleTo`. */
	treeVisibleTo(viewer: Viewer): Promise<TreeCircle[]>;
}

export interface CircleTreeDeps {
	tree: CircleTreeReads;
}

/** The nesting as `viewer` sees it, flat; `circleTree` builds it. */
export async function readCircleTree(deps: CircleTreeDeps, viewer: Viewer): Promise<TreeCircle[]> {
	return deps.tree.treeVisibleTo(viewer);
}
