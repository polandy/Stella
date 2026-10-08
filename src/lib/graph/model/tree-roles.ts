import { reciprocalKinTerm, type KinVariant } from '../../kinship/kinship';
import { otherEndRole, type RoleTerm } from '../../relationships/roles';
import type { GraphEdge, GraphModel } from './types';

/*
 * Who everybody on the family tree is to the person it is centred on (docs/05 §5.8): the tree
 * writes it under each name instead of naming every line. Pure: read off the links the snapshot
 * already carries. An entered tie is read from its far end, as the People card reads it; a
 * worked-out relative takes the kinship engine's term, turned round when the line was drawn from
 * the other side. Somebody tied to the centre only through others has no role of their own.
 */

/** A role and how it is worded; the caller says it in the viewer's language. */
export interface TreeRole {
	term: RoleTerm;
	variant: KinVariant;
}

/** Which of several lines to one person names them: family first, worked-out last. */
function rank(edge: GraphEdge): number {
	if (edge.kind === 'kinship') return 3;
	if (edge.category === 'family') return 0;
	if (edge.category === 'romantic') return 1;
	return 2;
}

/** What `otherId` is to the centre by this one line, or null when the line names nothing. */
function roleBy(edge: GraphEdge, centerId: string, otherWording: KinVariant): TreeRole | null {
	if (edge.kind === 'kinship' && edge.kin) {
		// The line names its source's role towards its target (`kinship-edges.ts`).
		return edge.source === centerId
			? { term: reciprocalKinTerm(edge.kin.term), variant: otherWording }
			: { term: edge.kin.term, variant: edge.kin.variant };
	}
	if (edge.kind !== 'relationship' || edge.typeKey === undefined) return null;
	const side = edge.source === centerId ? 'forward' : 'reverse';
	const term = otherEndRole({ typeKey: edge.typeKey, side });
	return term === null ? null : { term, variant: otherWording };
}

/** The role of everybody tied to `centerId` by a line of their own, keyed by their id. */
export function rolesTowards(graph: GraphModel, centerId: string): Map<string, TreeRole> {
	const people = new Map(graph.nodes.filter((n) => n.kind === 'person').map((n) => [n.id, n]));
	const best = new Map<string, { role: TreeRole; rank: number }>();
	for (const edge of graph.edges) {
		if (edge.source !== centerId && edge.target !== centerId) continue;
		const otherId = edge.source === centerId ? edge.target : edge.source;
		const other = people.get(otherId);
		if (!other || otherId === centerId) continue;
		const role = roleBy(edge, centerId, other.wording ?? 'neutral');
		if (role === null) continue;
		const known = best.get(otherId);
		if (!known || rank(edge) < known.rank) best.set(otherId, { role, rank: rank(edge) });
	}
	return new Map([...best].map(([id, { role }]) => [id, role]));
}
