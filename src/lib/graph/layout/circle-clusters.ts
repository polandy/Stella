import type { GraphModel } from '../model/types';
import {
	bowsAround,
	defaultSizeOf,
	LINE_CLEARANCE,
	shelve,
	type Arrangement,
	type Point,
	type SizeOf
} from './geometry';

/*
 * The arrangement by circles (docs/02 §2.7, docs/05 §5.8). Pure: positions from the model, no
 * renderer. Each circle stands with its members in a ring around it and the groups keep their
 * distance, largest first; whoever is in no circle is shelved beneath. Someone in several
 * circles stands with the biggest one — their other memberships still show as lines.
 */

/** Distances of the arrangement by circles, in model units. */
export const CLUSTER_SPACING = {
	/** The least room between any two nodes' names. */
	gap: 30,
	/** Between one group and the next. */
	group: 80
} as const;

/** The narrowest the block of groups gets, so a handful of circles still reads as rows. */
const MIN_WIDTH = 600;

/** A circle and the members standing around it. */
interface Group {
	circleId: string;
	members: string[];
}

/** Every node of `model` grouped by circle, each given the room `sizeOf` says it takes. */
export function circleClustersLayout(
	model: GraphModel,
	sizeOf: SizeOf = defaultSizeOf
): Arrangement {
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

	const rings = groups.map((g) => ring(g, sizeOf));
	// Room enough for the groups side by side in a roughly square block.
	const footprint = rings.reduce((sum, r) => sum + (2 * r.reach + CLUSTER_SPACING.group) ** 2, 0);
	const width = Math.max(Math.sqrt(footprint), ...rings.map((r) => 2 * r.reach), MIN_WIDTH);

	const positions = new Map<string, Point>();
	let cursor = 0;
	let rowTop = 0;
	let rowHeight = 0;
	groups.forEach((group, i) => {
		const { radius, reach } = rings[i];
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
				x: centre.x + radius * Math.cos(angle),
				y: centre.y + radius * Math.sin(angle)
			});
		});
		cursor += 2 * reach + CLUSTER_SPACING.group;
		rowHeight = Math.max(rowHeight, 2 * reach);
	});

	const loose = model.nodes.filter((n) => !positions.has(n.id)).map((n) => n.id);
	const shelfTop = groups.length > 0 ? rowTop + rowHeight + CLUSTER_SPACING.group : 0;
	shelve(
		loose,
		{ x: 0, y: shelfTop },
		width,
		sizeOf,
		CLUSTER_SPACING.gap,
		CLUSTER_SPACING.gap
	).forEach((point, id) => positions.set(id, point));
	return { positions, bows: bowsAround(positions, model.edges, sizeOf, LINE_CLEARANCE) };
}

/**
 * The ring a group's members stand on, and how far the group reaches from its centre. The ring
 * keeps the widest member's name clear of the circle in the middle and of its neighbours on
 * either side; the reach adds the widest member's own room.
 */
function ring(group: Group, sizeOf: SizeOf): { radius: number; reach: number } {
	const centre = sizeOf(group.circleId);
	const halfCentre = Math.max(centre.width, centre.height) / 2;
	if (group.members.length === 0) return { radius: 0, reach: halfCentre };
	const sizes = group.members.map(sizeOf);
	const halfMember = Math.max(...sizes.map((s) => Math.max(s.width, s.height))) / 2;
	const clearOfCentre = halfCentre + halfMember + CLUSTER_SPACING.gap;
	const chord = 2 * halfMember + CLUSTER_SPACING.gap;
	const clearOfNeighbours =
		group.members.length > 1 ? chord / (2 * Math.sin(Math.PI / group.members.length)) : 0;
	const radius = Math.max(clearOfCentre, clearOfNeighbours);
	return { radius, reach: radius + halfMember };
}
