import type { GraphModel } from '../model/types';
import { shelve, type Point } from './geometry';

/*
 * The arrangement by circles (docs/02 §2.7, docs/05 §5.8). Pure: positions from the model, no
 * renderer. Each circle stands with its members in a ring around it and the groups keep their
 * distance, largest first; whoever is in no circle is shelved beneath. Someone in several
 * circles stands with the biggest one — their other memberships still show as lines.
 */

/** Distances of the arrangement by circles, in model units. */
export const CLUSTER_SPACING = {
	/** The least room between any two nodes — wide enough for a name under each. */
	node: 120,
	/** Between one group and the next. */
	group: 120
} as const;

/** A circle and the members standing around it. */
interface Group {
	circleId: string;
	members: string[];
}

/** Positions for every node of `model`, grouped by circle. */
export function circleClustersLayout(model: GraphModel): Map<string, Point> {
	const circles = model.nodes.filter((n) => n.kind === 'circle').map((n) => n.id);
	const isCircle = new Set(circles);
	const membersOf = new Map<string, Set<string>>(circles.map((id) => [id, new Set()]));
	for (const edge of model.edges) {
		if (edge.kind !== 'membership') continue;
		const [circleId, personId] = isCircle.has(edge.source)
			? [edge.source, edge.target]
			: [edge.target, edge.source];
		membersOf.get(circleId)?.add(personId);
	}

	// Each person stands with the biggest of their circles; a tie goes to the one listed first.
	const home = new Map<string, string>();
	const bySize = [...circles].sort((a, b) => membersOf.get(b)!.size - membersOf.get(a)!.size);
	for (const circleId of bySize) {
		for (const personId of membersOf.get(circleId)!) {
			if (!home.has(personId)) home.set(personId, circleId);
		}
	}
	const groups: Group[] = bySize.map((circleId) => ({
		circleId,
		members: model.nodes.filter((n) => home.get(n.id) === circleId).map((n) => n.id)
	}));

	const radii = groups.map((g) => ringRadius(g.members.length));
	// Room enough for the groups side by side in a roughly square block.
	const footprint = radii.reduce(
		(sum, r) => sum + (2 * r + CLUSTER_SPACING.node + CLUSTER_SPACING.group) ** 2,
		0
	);
	const width = Math.max(
		Math.sqrt(footprint),
		...radii.map((r) => 2 * r + CLUSTER_SPACING.node),
		CLUSTER_SPACING.node * 4
	);

	const positions = new Map<string, Point>();
	let cursor = 0;
	let rowTop = 0;
	let rowHeight = 0;
	groups.forEach((group, i) => {
		// The group's reach: its ring plus half a node's room on every side.
		const reach = radii[i] + CLUSTER_SPACING.node / 2;
		if (cursor > 0 && cursor + 2 * reach > width) {
			cursor = 0;
			rowTop += rowHeight + CLUSTER_SPACING.group;
			rowHeight = 0;
		}
		const centre = { x: cursor + reach, y: rowTop + reach };
		positions.set(group.circleId, centre);
		group.members.forEach((id, k) => {
			const angle = -Math.PI / 2 + (k / group.members.length) * 2 * Math.PI;
			positions.set(id, {
				x: centre.x + radii[i] * Math.cos(angle),
				y: centre.y + radii[i] * Math.sin(angle)
			});
		});
		cursor += 2 * reach + CLUSTER_SPACING.group;
		rowHeight = Math.max(rowHeight, 2 * reach);
	});

	const loose = model.nodes.filter((n) => !positions.has(n.id)).map((n) => n.id);
	const shelfTop = groups.length > 0 ? rowTop + rowHeight + CLUSTER_SPACING.group : 0;
	shelve(loose, { x: 0, y: shelfTop }, width, CLUSTER_SPACING.node, CLUSTER_SPACING.node).forEach(
		(point, id) => positions.set(id, point)
	);
	return positions;
}

/**
 * The smallest ring that keeps `count` members a node's room from each other and from the
 * circle in the middle.
 */
function ringRadius(count: number): number {
	if (count === 0) return 0;
	if (count === 1) return CLUSTER_SPACING.node;
	return Math.max(CLUSTER_SPACING.node, CLUSTER_SPACING.node / (2 * Math.sin(Math.PI / count)));
}
