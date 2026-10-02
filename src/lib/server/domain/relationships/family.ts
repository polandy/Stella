import type { GraphModel } from '../../../graph/model/types';
import type { KinshipGraph, Pair } from '../../../kinship/kinship';
import type { ExclusionFacts } from '../../../relationships/exclusions';
import type { Viewer } from '../../access/visibility';
import {
	exclusionFactsFrom,
	kinshipFrom,
	type KinshipRead,
	type RelationshipRepository,
	type RelationshipView
} from './relationships';
import {
	reviewPersonIn,
	type ProposedLink,
	type SuggestionDismissalRepository
} from './suggestion-review';

/*
 * The family cards of the person page in one read (docs/04 §4.11). Each card has its own
 * use-case — derived kin and proposals, the review, what the picker greys out, the map — and
 * each of those reads the whole visible kinship graph for itself. Asked one after the other
 * they read it four times in a request; here it is read once, together with the drawing the
 * map is cut from, and handed to the same pure functions those use-cases are made of.
 */

/** The visible graph as the explorer draws it, and the kinship engine's input — one read. */
export interface VisibleFamily {
	graph: GraphModel;
	kinship: KinshipGraph;
}

/** Where the visible family comes from, already scoped to the viewer (docs/03 §3.7). */
export interface VisibleFamilySource {
	loadVisibleGraphWithKinship(viewer: Viewer): Promise<VisibleFamily>;
}

export interface FamilyReadDeps {
	family: VisibleFamilySource;
	relationships: Pick<RelationshipRepository, 'listForContactVisibleTo'>;
	dismissals: Pick<SuggestionDismissalRepository, 'listForHousehold'>;
}

/** What the page asked for besides the person: the links just stored, and the open review. */
export interface FamilyRequest {
	proposeFor: readonly Pair[];
	reviewOpen: boolean;
}

export interface FamilyRead {
	graph: GraphModel;
	/** The person's own links, from their side. */
	ties: RelationshipView[];
	kinship: KinshipRead;
	reviewed: ProposedLink[];
	exclusionFacts: ExclusionFacts;
}

export async function readFamilyOf(
	deps: FamilyReadDeps,
	viewer: Viewer,
	subjectId: string,
	request: FamilyRequest
): Promise<FamilyRead> {
	// Only a proposal or the review weighs what the household declined; the rest never asks.
	const needsDismissals = request.proposeFor.length > 0 || request.reviewOpen;
	const [family, ties, dismissals] = await Promise.all([
		deps.family.loadVisibleGraphWithKinship(viewer),
		deps.relationships.listForContactVisibleTo(viewer, subjectId),
		needsDismissals ? deps.dismissals.listForHousehold(viewer) : Promise.resolve([])
	]);
	return {
		graph: family.graph,
		ties,
		kinship: kinshipFrom(family.kinship, dismissals, subjectId, request.proposeFor),
		reviewed: request.reviewOpen
			? reviewPersonIn(family.kinship, dismissals, subjectId, { includeDismissed: true })
			: [],
		exclusionFacts: exclusionFactsFrom(family.kinship, ties)
	};
}
