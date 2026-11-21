import { PARENT_CHILD_TYPE_KEY } from '../../relationships/type-keys';
import type { RoleTerm } from '../../relationships/roles';
import { rolesTowards } from './tree-roles';
import type { GraphModel } from './types';

/*
 * The centre's core family — who the family tree is framed on first (docs/dev/05 §5.8). Pure:
 * read off the entered parent lines the tree is drawn from, and the roles the tree
 * writes under the names, so a grandparent known only by a worked-out line still counts.
 */

/** The roles that make somebody core family; cousins, in-laws, aunts and uncles are not. */
const CORE_ROLES: ReadonlySet<RoleTerm> = new Set<RoleTerm>([
	'parent',
	'grandparent',
	'sibling',
	'half-sibling',
	'partner',
	'spouse',
	'child'
]);

/**
 * The centre and their parents, grandparents, siblings, partners and children on `graph`, former
 * partners included: they stand in the same row.
 */
export function coreFamilyOf(graph: GraphModel, centerId: string): Set<string> {
	const parentLines = graph.edges.filter(
		(e) => e.kind === 'relationship' && e.typeKey === PARENT_CHILD_TYPE_KEY
	);
	const parentsOf = (id: string) => parentLines.filter((e) => e.target === id).map((e) => e.source);
	const parents = parentsOf(centerId);
	const core = new Set([centerId, ...parents, ...parents.flatMap(parentsOf)]);
	// Sharing a parent makes a sibling, entered as one or not.
	for (const line of parentLines) if (parents.includes(line.source)) core.add(line.target);
	for (const [id, role] of rolesTowards(graph, centerId)) {
		if (CORE_ROLES.has(role.term)) core.add(id);
	}
	return core;
}
