import { PARENT_CHILD_TYPE_KEY, PARTNER_TYPE_KEYS } from '../../relationships/type-keys';
import { familiesOf, isFamilyLink } from './generations';
import type { GraphEdge, GraphModel } from './types';

/*
 * Which lines the family tree leaves off (docs/05 §5.8). Pure.
 *
 * The tree is drawn from two kinds of line: a parent's line to a child, and the bar between
 * partners. Every other family line — a grandparent, an aunt, a cousin, a sibling, an in-law,
 * entered or worked out — names a chain of those, and where the chain is on the map the bars
 * already say it; drawn again, it only stacks lines between the rows. So it is left off, even
 * around the selected person, whose roles under the names say it in words. Where its chain is
 * not on the map it stays: then it is the one thing tying the two together.
 *
 * Whoever is outside the family stands on the shelf beneath without a line up to the tree, and
 * a tie that is no family line — a friendship, a colleague, a circle — is not drawn across the
 * tree either: such a line shows while one of its ends is selected. A traced path shows every
 * line it runs along.
 */

/** The longest chain a family term names: a cousin is up two parents and down two. */
const MAX_CHAIN_LINKS = 4;

const isTreeLine = (edge: GraphEdge) =>
	edge.kind === 'relationship' &&
	edge.typeKey !== undefined &&
	(edge.typeKey === PARENT_CHILD_TYPE_KEY || PARTNER_TYPE_KEYS.includes(edge.typeKey));

/** The ids of the lines the tree of `model` does not draw, `selectedId`'s shelf lines aside. */
export function hiddenInTree(
	model: GraphModel,
	selectedId: string | null,
	onPath: ReadonlySet<string> = new Set()
): Set<string> {
	const members = new Set(familiesOf(model).flatMap((family) => [...family.keys()]));

	const neighbours = new Map<string, string[]>();
	for (const edge of model.edges) {
		if (!isTreeLine(edge)) continue;
		neighbours.set(edge.source, [...(neighbours.get(edge.source) ?? []), edge.target]);
		neighbours.set(edge.target, [...(neighbours.get(edge.target) ?? []), edge.source]);
	}
	/** Whether a chain of at most four tree lines joins the two, not counting a direct one. */
	const joined = (from: string, to: string): boolean => {
		const reached = new Set([from]);
		let frontier = [from];
		for (let step = 0; step < MAX_CHAIN_LINKS && frontier.length > 0; step++) {
			const next: string[] = [];
			for (const id of frontier) {
				for (const neighbour of neighbours.get(id) ?? []) {
					if (neighbour === to) return true;
					if (reached.has(neighbour)) continue;
					reached.add(neighbour);
					next.push(neighbour);
				}
			}
			frontier = next;
		}
		return false;
	};

	const hidden = new Set<string>();
	for (const edge of model.edges) {
		if (onPath.has(edge.id) || isTreeLine(edge)) continue;
		const inFamily = members.has(edge.source) && members.has(edge.target);
		if (inFamily && isFamilyLink(edge)) {
			if (joined(edge.source, edge.target)) hidden.add(edge.id);
			continue;
		}
		if (edge.source !== selectedId && edge.target !== selectedId) hidden.add(edge.id);
	}
	return hidden;
}
