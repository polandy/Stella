import { deriveKinshipForAll, type KinshipGraph, type KinTerm } from '../../kinship/kinship';
import type { GraphEdge } from './types';

/*
 * Turns inferred kinship into graph edges (docs/02 §2.7, §2.4.1).
 *
 * The person page names derived relatives one subject at a time; the explorer needs the same
 * knowledge as lines. So every person is asked once and the answers are folded into one edge
 * per pair: Otto sees a grandchild where Hans sees a grandfather, and that is a single line.
 *
 * Pure and dependency-free — the caller passes an already visibility-scoped graph, so a derived
 * line can never reveal a person the viewer may not see.
 */

/** Terms that read the same from both ends — those lines carry no direction. */
const SYMMETRIC_TERMS: ReadonlySet<KinTerm> = new Set<KinTerm>([
	'sibling',
	'half-sibling',
	'cousin',
	'step-sibling',
	'sibling-in-law'
]);

/** Namespace for the edge ids, so a derived line can never collide with a stored one. */
const KINSHIP_EDGE_PREFIX = 'kin';

/** Sorted, so the id of a pair is the same whichever side was asked first. */
const edgeId = (x: string, y: string) =>
	x < y ? `${KINSHIP_EDGE_PREFIX}:${x}:${y}` : `${KINSHIP_EDGE_PREFIX}:${y}:${x}`;

/**
 * Every kinship the primary links imply, as edges running from the relative to the subject —
 * the same direction stored relationships use, so `label` always names the source's role
 * ("Grandfather" = source is the grandfather of target). Pairs already linked by hand are
 * left alone by the inference engine and so never appear here.
 */
export function deriveKinshipEdges(graph: KinshipGraph): GraphEdge[] {
	const edges = new Map<string, GraphEdge>();

	for (const [subjectId, relatives] of deriveKinshipForAll(graph)) {
		for (const kin of relatives) {
			const id = edgeId(subjectId, kin.personId);
			if (edges.has(id)) continue; // the mirrored view of a pair already drawn
			edges.set(id, {
				id,
				source: kin.personId,
				target: subjectId,
				kind: 'kinship',
				label: kin.label,
				derived: true,
				directed: !SYMMETRIC_TERMS.has(kin.term)
			});
		}
	}

	return [...edges.values()];
}
