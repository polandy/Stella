import type { RelationshipCategory } from '../../relationships/categories';
import type { CircleRole } from './ego-network';
import type { EdgeKind, GraphEdge, GraphModel } from './types';

/*
 * Grouping a circle's members by role (docs/02 §2.7). Pure: a model in, the groups and the
 * lines standing in for others out — the renderer draws a group as a frame around its members.
 * A big circle otherwise hangs every member off one node on a line of their own; grouped, one
 * line joins each role to the circle, and the links between two groups travel as one line.
 */

/** Everyone holding one role in one circle, standing together. */
export interface RoleGroup {
	id: string;
	circleId: string;
	role: CircleRole;
	/** In the order the model lists them. */
	memberIds: string[];
}

/** One line drawn in place of several: from a circle to a group, or between two groups. */
export interface EdgeBundle {
	id: string;
	source: string;
	target: string;
	kind: EdgeKind;
	category?: RelationshipCategory;
	/** The edges it stands for. */
	edgeIds: string[];
}

export interface RoleGrouping {
	/** Biggest circle first; within a circle the most-held role first, "no role" last. */
	groups: RoleGroup[];
	/** Person id → the id of the group they stand in. */
	groupOf: Map<string, string>;
	bundles: EdgeBundle[];
	/**
	 * Edges drawn only while their node is selected: the ones a bundle stands for, and the
	 * links inside a group when those are switched off.
	 */
	tucked: Set<string>;
}

export interface RoleGroupOptions {
	/** Draw the links between members of one group (docs/02 §2.7: on by default). */
	innerLinks: boolean;
	/** Groups the reader asked to see individually, by id. */
	dissolved?: ReadonlySet<string>;
}

/** A frame around one face adds nothing, so a role needs this many people to form a group. */
const MIN_GROUP_SIZE = 2;
/** Nor is one line worth bundling. */
const MIN_BUNDLE_SIZE = 2;

/** The id a group keeps across rebuilds, so a dissolved one is found again. */
function groupId(circleId: string, role: CircleRole): string {
	return `rolegroup:${circleId}:${role === null ? '-' : `=${role}`}`;
}

const roleOf = (edge: GraphEdge): CircleRole => edge.label ?? null;

export function groupByRole(model: GraphModel, options: RoleGroupOptions): RoleGrouping {
	const order = new Map(model.nodes.map((n, i) => [n.id, i]));
	const isCircle = new Set(model.nodes.filter((n) => n.kind === 'circle').map((n) => n.id));

	// Every circle's memberships, as (person, role, edge).
	const memberships = new Map<string, { personId: string; role: CircleRole; edgeId: string }[]>();
	for (const edge of model.edges) {
		if (edge.kind !== 'membership') continue;
		const [circleId, personId] = isCircle.has(edge.source)
			? [edge.source, edge.target]
			: [edge.target, edge.source];
		if (!isCircle.has(circleId) || !order.has(personId)) continue;
		const list = memberships.get(circleId) ?? [];
		list.push({ personId, role: roleOf(edge), edgeId: edge.id });
		memberships.set(circleId, list);
	}

	// Someone in several circles joins a group of the biggest; a tie goes to the one listed first.
	const circles = [...memberships.keys()].sort(
		(a, b) =>
			memberships.get(b)!.length - memberships.get(a)!.length || order.get(a)! - order.get(b)!
	);

	const groups: RoleGroup[] = [];
	const groupOf = new Map<string, string>();
	const bundles: EdgeBundle[] = [];
	const tucked = new Set<string>();

	for (const circleId of circles) {
		const byRole = new Map<CircleRole, { personId: string; edgeId: string }[]>();
		for (const m of memberships.get(circleId)!) {
			if (groupOf.has(m.personId)) continue;
			const list = byRole.get(m.role) ?? [];
			list.push(m);
			byRole.set(m.role, list);
		}
		const rank = (role: CircleRole) => (role === null ? 1 : 0);
		const roles = [...byRole.keys()].sort(
			(a, b) =>
				rank(a) - rank(b) ||
				byRole.get(b)!.length - byRole.get(a)!.length ||
				(a ?? '').localeCompare(b ?? '')
		);
		for (const role of roles) {
			const members = byRole.get(role)!;
			const id = groupId(circleId, role);
			if (members.length < MIN_GROUP_SIZE || options.dissolved?.has(id)) continue;
			members.sort((a, b) => order.get(a.personId)! - order.get(b.personId)!);
			groups.push({ id, circleId, role, memberIds: members.map((m) => m.personId) });
			for (const m of members) {
				groupOf.set(m.personId, id);
				tucked.add(m.edgeId);
			}
			bundles.push({
				id: `bundle:${circleId}>${id}`,
				source: circleId,
				target: id,
				kind: 'membership',
				edgeIds: members.map((m) => m.edgeId)
			});
		}
	}

	// Links between two groups gather into one line per kind; links inside a group stay.
	const between = new Map<string, EdgeBundle>();
	for (const edge of model.edges) {
		if (edge.kind === 'membership') continue;
		const from = groupOf.get(edge.source);
		const to = groupOf.get(edge.target);
		if (from === undefined || to === undefined) continue;
		if (from === to) {
			if (!options.innerLinks) tucked.add(edge.id);
			continue;
		}
		const [a, b] = from < to ? [from, to] : [to, from];
		const key = `${a}|${b}|${edge.kind}|${edge.category ?? ''}`;
		const bundle = between.get(key) ?? {
			id: `bundle:${key}`,
			source: a,
			target: b,
			kind: edge.kind,
			...(edge.category ? { category: edge.category } : {}),
			edgeIds: []
		};
		bundle.edgeIds.push(edge.id);
		between.set(key, bundle);
	}
	for (const bundle of between.values()) {
		if (bundle.edgeIds.length < MIN_BUNDLE_SIZE) continue;
		bundles.push(bundle);
		for (const id of bundle.edgeIds) tucked.add(id);
	}

	return { groups, groupOf, bundles, tucked };
}
