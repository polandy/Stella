import type { GraphModel } from './types';

/*
 * The map, minus what is on its way out (docs/02 §2.23, docs/05 §5.7).
 *
 * A removal is held for an undo window before it is sent, and the list hides the row for that
 * whole window. The map has to agree with the list: a link that is visibly gone from one and
 * still drawn in the other reads as the app not having understood, and eight seconds later it
 * disappears by itself — which looks like a slow save rather than a window that was there to
 * be used.
 */
export function withoutRelationships(
	model: GraphModel,
	removed: ReadonlySet<string>,
	/** The person the map is centred on; they stay even when nothing is left around them. */
	centerId: string
): GraphModel {
	if (removed.size === 0) return model;

	const edges = model.edges.filter(
		(edge) => !(edge.kind === 'relationship' && removed.has(edge.id))
	);
	const connected = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
	// A person was on the map because of a link; without one there is nothing left to say
	// about them here. Circles follow their memberships for the same reason.
	const nodes = model.nodes.filter((node) => node.id === centerId || connected.has(node.id));

	return { nodes, edges };
}
