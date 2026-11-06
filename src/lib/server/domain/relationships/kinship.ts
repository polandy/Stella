import {
	deriveKinship,
	type DerivedKin,
	type KinshipGraph,
	type Pair
} from '../../../kinship/kinship';
import { evaluateAll } from '../../../suggestions/engine';
import type { Dismissal } from '../../../suggestions/claims';
import type { PrimaryLink, Trigger } from '../../../suggestions/types';
import { buildView } from '../../../suggestions/view';
import type { Viewer } from '../../access/visibility';
import { nameProposals, type ProposedLink, type SuggestionReviewSource } from './suggestion-review';

/**
 * Everything the person page shows about inferred kinship (docs/02 §2.4.1): the relatives
 * derived for `subjectId`, and — when primary links have just been stored between the pairs of
 * `proposeFor`, one or a whole batch — the links that follow from them and are not stored yet.
 *
 * One port call serves both, because both read the same graph. Visibility is settled by the
 * read model, so neither a derived label nor a proposal can name someone the viewer may not see.
 */
export interface KinshipRead {
	derived: DerivedKin[];
	proposals: ProposedLink[];
}

export async function readKinship(
	deps: SuggestionReviewSource,
	viewer: Viewer,
	subjectId: string,
	proposeFor: readonly Pair[] = []
): Promise<KinshipRead> {
	const [graph, dismissals] = await Promise.all([
		deps.kinship.loadKinshipGraphVisibleTo(viewer),
		deps.dismissals.listForHousehold(viewer)
	]);
	return kinshipFrom(graph, dismissals, subjectId, proposeFor);
}

/**
 * `readKinship` over a graph and a dismissal log already read. The dismissals are only
 * consulted when `proposeFor` names a stored link, so a caller that has none may pass `[]`.
 *
 * Every pair is read as entered on `subjectId`'s page — the only page that names pairs after a
 * write — which is what lets L3 stay quiet where the form already offered the second parent.
 */
export function kinshipFrom(
	graph: KinshipGraph,
	dismissals: readonly Dismissal[],
	subjectId: string,
	proposeFor: readonly Pair[] = []
): KinshipRead {
	const derived = deriveKinship(graph, subjectId);
	const triggers = proposeFor.flatMap((pair): Trigger[] => {
		const link = primaryLinkBetween(graph, pair.a, pair.b);
		return link ? [{ kind: 'link-stored', link, enteredFrom: subjectId }] : [];
	});
	if (triggers.length === 0) return { derived, proposals: [] };

	// A claim declined once is not offered again, however it is reached (§6.4) — including
	// here, in the instant after the write, where it would otherwise slip past the log.
	const view = buildView(graph, dismissals);
	const proposals = nameProposals(evaluateAll(triggers, view), view.nameOf);
	return { derived, proposals };
}

/**
 * The primary link stored between two people, if any. Reading it back from the graph rather
 * than trusting the caller means a hand-written URL can only ever name a link that exists
 * and that the viewer may see.
 */
function primaryLinkBetween(graph: KinshipGraph, a: string, b: string): PrimaryLink | null {
	const joins = (x: string, y: string) => (x === a && y === b) || (x === b && y === a);
	for (const edge of graph.parentEdges) {
		if (joins(edge.parentId, edge.childId)) {
			return { kind: 'parent', fromId: edge.parentId, toId: edge.childId };
		}
	}
	for (const edge of graph.siblingEdges) {
		if (joins(edge.a, edge.b)) return { kind: 'sibling', fromId: edge.a, toId: edge.b };
	}
	for (const edge of graph.partnerEdges) {
		if (joins(edge.a, edge.b)) return { kind: 'partner', fromId: edge.a, toId: edge.b };
	}
	return null;
}
