import type { RoleGrouping } from '../model/role-groups';
import { groupBlock } from './group-blocks';
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
 * circles stands with the biggest one — their other memberships still show as lines. With the
 * circles grouped by role (docs/02 §2.7) a group stands on the ring as one block, its members
 * in rows inside it, in place of each of them standing there alone.
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

/** What stands on a circle's ring: one person, or a group by role as one block. */
interface Unit {
	ids: string[];
	/** Where each of `ids` stands, from the unit's centre. */
	offsets: Point[];
	/** How far the unit reaches from its centre, whichever way it is turned. */
	reach: number;
}

/** A circle and what stands around it. */
interface Group {
	circleId: string;
	units: Unit[];
}

/** Every node of `model` grouped by circle, each given the room `sizeOf` says it takes. */
export function circleClustersLayout(
	model: GraphModel,
	sizeOf: SizeOf = defaultSizeOf,
	grouping?: RoleGrouping
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
	// Someone in a group stands with the group's circle, which the grouping chose the same way.
	const home = new Map<string, string>();
	const groupsBy = new Map<string, RoleGrouping['groups']>();
	for (const g of grouping?.groups ?? []) {
		groupsBy.set(g.circleId, [...(groupsBy.get(g.circleId) ?? []), g]);
		for (const id of g.memberIds) home.set(id, g.circleId);
	}
	const bySize = [...circles].sort((a, b) => membersOf.get(b)!.size - membersOf.get(a)!.size);
	for (const circleId of bySize) {
		for (const personId of membersOf.get(circleId)!) {
			if (!home.has(personId)) home.set(personId, circleId);
		}
	}
	const grouped = new Set(grouping?.groupOf.keys() ?? []);
	const groups: Group[] = bySize.map((circleId) => ({
		circleId,
		units: [
			...(groupsBy.get(circleId) ?? []).map((g) => ({ ids: g.memberIds, ...groupBlock(g.memberIds, sizeOf) })),
			...model.nodes
				.filter((n) => home.get(n.id) === circleId && !grouped.has(n.id))
				.map((n) => alone(n.id, sizeOf))
		]
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
		group.units.forEach((unit, k) => {
			const angle = -Math.PI / 2 + (k / group.units.length) * 2 * Math.PI;
			const at = { x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle) };
			unit.ids.forEach((id, m) => {
				positions.set(id, { x: at.x + unit.offsets[m].x, y: at.y + unit.offsets[m].y });
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

/** One person standing on the ring by themselves. */
function alone(id: string, sizeOf: SizeOf): Unit {
	const size = sizeOf(id);
	return { ids: [id], offsets: [{ x: 0, y: 0 }], reach: Math.max(size.width, size.height) / 2 };
}

/**
 * The ring a group's units stand on, and how far the group reaches from its centre. The ring
 * keeps the widest unit clear of the circle in the middle and of its neighbours on either
 * side; the reach adds the widest unit's own room.
 */
function ring(group: Group, sizeOf: SizeOf): { radius: number; reach: number } {
	const centre = sizeOf(group.circleId);
	const halfCentre = Math.max(centre.width, centre.height) / 2;
	if (group.units.length === 0) return { radius: 0, reach: halfCentre };
	const halfUnit = Math.max(...group.units.map((u) => u.reach));
	const clearOfCentre = halfCentre + halfUnit + CLUSTER_SPACING.gap;
	const chord = 2 * halfUnit + CLUSTER_SPACING.gap;
	const clearOfNeighbours =
		group.units.length > 1 ? chord / (2 * Math.sin(Math.PI / group.units.length)) : 0;
	const radius = Math.max(clearOfCentre, clearOfNeighbours);
	return { radius, reach: radius + halfUnit };
}
