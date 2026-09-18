import { emptyModel, mergeModels } from './graph-model';
import type { GraphDataSource, GraphEdge, GraphModel, Neighborhood } from './types';

/*
 * Ego-network builders (docs/04 §4.11, docs/02 §2.7). These grow a GraphModel hop by hop
 * through the GraphDataSource port; the port applies visibility scoping, so only nodes and
 * edges the viewer may see ever enter the model. Pure otherwise — deterministic given a source.
 */

function absorb(model: GraphModel, hood: Neighborhood): GraphModel {
	return mergeModels(model, { nodes: [hood.center, ...hood.nodes], edges: hood.edges });
}

/**
 * Build the network centred on `centerId` out to `depth` hops. `depth` 1 yields the centre
 * plus its immediate relationships and circles; higher
 * depths fetch each frontier node's neighbourhood in turn. Nodes discovered at the final hop
 * are included, but their onward edges are not — that is what {@link expandNode} is for.
 * An unknown or invisible centre yields an empty model.
 */
export async function buildEgoNetwork(
	source: GraphDataSource,
	centerId: string,
	depth = 1
): Promise<GraphModel> {
	const center = await source.neighborhood(centerId);
	if (!center) return emptyModel();
	if (depth < 1) {
		return { nodes: [center.center], edges: [] };
	}

	let model = emptyModel();
	const visited = new Set<string>();
	let frontier = [centerId];

	for (let level = 0; level < depth && frontier.length > 0; level++) {
		const next: string[] = [];
		for (const id of frontier) {
			if (visited.has(id)) continue;
			visited.add(id);
			const hood = id === centerId ? center : await source.neighborhood(id);
			if (!hood) continue;
			model = absorb(model, hood);
			for (const n of hood.nodes) {
				if (!visited.has(n.id)) next.push(n.id);
			}
		}
		frontier = next;
	}
	return model;
}

/** A circle member's role; `null` stands for a member who has none. */
export type CircleRole = string | null;

/** One role a circle's members carry, and how many of them carry it. */
export interface CircleRoleOption {
	role: CircleRole;
	count: number;
}

const roleOf = (edge: GraphEdge): CircleRole => edge.label ?? null;

/**
 * The roles a circle's members carry, most-populated first (ties alphabetical, "no role"
 * last), so the reader can pick which of them to open up before expanding the circle.
 */
export function circleRoles(hood: Neighborhood): CircleRoleOption[] {
	const counts = new Map<CircleRole, number>();
	for (const edge of hood.edges) {
		if (edge.kind !== 'membership') continue;
		counts.set(roleOf(edge), (counts.get(roleOf(edge)) ?? 0) + 1);
	}
	const rank = ({ role }: CircleRoleOption) => (role === null ? 1 : 0);
	return [...counts]
		.map(([role, count]) => ({ role, count }))
		.sort(
			(a, b) => rank(a) - rank(b) || b.count - a.count || (a.role ?? '').localeCompare(b.role ?? '')
		);
}

/** Keep only the members of `hood` (a circle) whose role is in `roles`. */
function withRoles(hood: Neighborhood, roles: ReadonlySet<CircleRole>): Neighborhood {
	const edges = hood.edges.filter((e) => e.kind !== 'membership' || roles.has(roleOf(e)));
	const reached = new Set(edges.flatMap((e) => [e.source, e.target]));
	return { ...hood, edges, nodes: hood.nodes.filter((n) => reached.has(n.id)) };
}

/**
 * Which roles a circle stands open for after another expansion, or `undefined` once every
 * role in `all` is open. `before` is what stood open until now (`undefined` for a circle that
 * was never expanded, or that is fully open — told apart by `expanded`). Expanding again
 * widens the opened set and never narrows it, so a resync reopens all the reader has seen.
 */
export function rolesOpenAfter(
	expanded: boolean,
	before: ReadonlySet<CircleRole> | undefined,
	chosen: ReadonlySet<CircleRole>,
	all: ReadonlySet<CircleRole>
): ReadonlySet<CircleRole> | undefined {
	if (expanded && before === undefined) return undefined;
	const open = new Set([...(before ?? []), ...chosen]);
	return [...all].every((role) => open.has(role)) ? undefined : open;
}

/**
 * Expand one node in place: fetch its neighbourhood and merge it into `model`, revealing that
 * node's relationships and circles without disturbing the rest. Unknown/invisible nodes leave
 * the model unchanged. Returns a new model (the input is not mutated).
 *
 * For a circle, `roles` narrows the reveal to the members holding one of those roles; without
 * it every member appears. It means nothing for a person.
 */
export async function expandNode(
	source: GraphDataSource,
	model: GraphModel,
	nodeId: string,
	roles?: ReadonlySet<CircleRole>
): Promise<GraphModel> {
	const hood = await source.neighborhood(nodeId);
	if (!hood) return model;
	return absorb(model, roles && hood.center.kind === 'circle' ? withRoles(hood, roles) : hood);
}

/**
 * Rebuild an explored model against a fresh snapshot of the graph: the ego network around
 * `centerId` out to `depth`, plus the neighbourhood of every node in `expandedIds` the
 * rebuilt model actually reaches — in the order the reader expanded them, so an expansion
 * that only a previous one revealed is applied too. A circle expanded for some roles only
 * (`circleRolesChosen`) is rebuilt for those roles. A node the new snapshot no longer
 * reaches from the centre is skipped rather than merged in as an island.
 *
 * This is what lets a map already on screen follow a save (a new relationship, a corrected
 * one) without throwing away what its reader had opened up.
 */
export async function rebuildExplored(
	source: GraphDataSource,
	centerId: string,
	expandedIds: Iterable<string>,
	depth = 1,
	circleRolesChosen: ReadonlyMap<string, ReadonlySet<CircleRole>> = new Map()
): Promise<GraphModel> {
	let model = await buildEgoNetwork(source, centerId, depth);
	for (const id of expandedIds) {
		if (!model.nodes.some((n) => n.id === id)) continue;
		model = await expandNode(source, model, id, circleRolesChosen.get(id));
	}
	return model;
}
