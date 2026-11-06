import { TranslatableError } from '../../../i18n/translatable';
import { phrase, type Phrase } from '../../../i18n/phrase';
import type { KinshipGraph } from '../../../kinship/kinship';
import type { Endpoints } from '../../../relationships/endpoints';
import {
	exclusionFor,
	MAX_PARENTS,
	type Exclusion,
	type ExclusionFacts,
	type ExclusionReason
} from '../../../relationships/exclusions';
import { relationshipRowLabel } from '../../../relationships/labels';
import type { Viewer } from '../../access/visibility';
import type { RelationshipTieReads, RelationshipType, RelationshipView } from './relationships';
import type { KinshipGraphReads } from './suggestion-review';

/*
 * What is already on record, and what that rules out (docs/02 §2.4). The rules themselves
 * are pure and live in `$lib/relationships/exclusions`; here they are handed the household's
 * links. The person page is given the very same reading, so the picker greys out exactly
 * what this use-case would refuse.
 */

/**
 * The sentence each refusal is read as, given what it is about. `alreadyRomantic` refuses
 * because of a particular link and says which one — from the subject's side, and translated
 * where Stella owns the type — since the person's name alone reads as a claim about the tie
 * that was just refused rather than about the one standing in the way.
 */
type NameOf = (contactId: string) => string;

const PHRASE_FOR_REASON: Record<ExclusionReason, (e: Exclusion, nameOf: NameOf) => Phrase> = {
	alreadyRomantic: (exclusion, nameOf) => {
		const name = nameOf(exclusion.personId);
		const tie = exclusion.tie;
		if (!tie) return phrase('errors.relationship.alreadyRomantic', { name });
		return (t) => t('errors.relationship.alreadyTied', { tie: relationshipRowLabel(t, tie), name });
	},
	// Both people: which of the two is spoken for is the whole answer, and naming only the
	// partner leaves the sentence to be read as being about whoever's page it arrives on.
	romanticTaken: (exclusion, nameOf) =>
		phrase('errors.relationship.romanticTaken', {
			name: nameOf(exclusion.personId),
			partner: exclusion.partnerId ? nameOf(exclusion.partnerId) : ''
		}),
	parentsComplete: (exclusion, nameOf) =>
		phrase('errors.relationship.parentsComplete', {
			name: nameOf(exclusion.personId),
			max: MAX_PARENTS
		})
};

/** A tie that cannot hold beside the ties already on record (docs/02 §2.4). */
export class RelationshipExcludedError extends TranslatableError {
	/** Which rule refused — a caller reacts to the kind, never to the wording. */
	readonly reason: ExclusionReason;

	constructor(exclusion: Exclusion, nameOf: (contactId: string) => string) {
		super(PHRASE_FOR_REASON[exclusion.reason](exclusion, nameOf), 'RelationshipExcludedError');
		this.reason = exclusion.reason;
	}
}

/** The facts, plus the names to word a refusal with — both cut from the one graph read. */
interface ExclusionCheck {
	facts: ExclusionFacts;
	nameOf: (contactId: string) => string;
}

/** The two reads an exclusion check is made of. */
export interface ExclusionSource {
	kinship: KinshipGraphReads;
	ties: RelationshipTieReads;
}

/**
 * What the exclusion rules need to judge a claim made from `subjectId`'s profile, read from
 * the two read models, both already scoped to the viewer.
 */
async function loadExclusionCheck(
	deps: ExclusionSource,
	viewer: Viewer,
	subjectId: string
): Promise<ExclusionCheck> {
	const [graph, ties] = await Promise.all([
		deps.kinship.loadKinshipGraphVisibleTo(viewer),
		deps.ties.listForContactVisibleTo(viewer, subjectId)
	]);
	const names = new Map(graph.people.map((person) => [person.id, person.displayName]));
	return {
		facts: exclusionFactsFrom(graph, ties),
		nameOf: (contactId) => names.get(contactId) ?? ''
	};
}

/**
 * The exclusion facts out of a graph and the subject's own ties that were already read — the
 * person page reads both for other cards, and asking the store again would only repeat them.
 * Only partnerships that still hold are passed on — that is the escape a household needs,
 * because a marriage marked former stops standing in the way of the next one.
 */
export function exclusionFactsFrom(
	graph: KinshipGraph,
	ties: readonly RelationshipView[]
): ExclusionFacts {
	return {
		subjectTies: ties.map((tie) => ({
			relationshipId: tie.id,
			otherContactId: tie.otherContactId,
			category: tie.category,
			// Carried so a refusal can name the link it is refusing for, in the words that row
			// reads in on this profile.
			typeKey: tie.typeKey,
			side: tie.side,
			label: tie.label
		})),
		romanticPairs: graph.partnerEdges
			.filter((edge) => !edge.former)
			.map((edge) => ({ a: edge.a, b: edge.b, sinceDate: edge.sinceDate ?? null })),
		parentEdges: graph.parentEdges.map((edge) => ({
			parentId: edge.parentId,
			childId: edge.childId
		}))
	};
}

/** The same reading the write is guarded by, for the picker on the person page. */
export async function readExclusionFacts(
	deps: ExclusionSource,
	viewer: Viewer,
	subjectId: string
): Promise<ExclusionFacts> {
	return (await loadExclusionCheck(deps, viewer, subjectId)).facts;
}

/**
 * Refuse a claim the household's own records already rule out.
 *
 * Read from `perspectiveContactId` — the profile the entry was made on — rather than from the
 * stored `from` endpoint. A symmetric type is canonicalised by id, so the two are often not
 * the same person, and a refusal read from the wrong end names the link backwards: *Godparent
 * of Giulio* on Giulio's own page, where what he is is the godchild.
 */
export async function guardExclusions(
	deps: ExclusionSource,
	viewer: Viewer,
	endpoints: Endpoints,
	type: RelationshipType,
	perspectiveContactId: string,
	exceptId?: string
): Promise<void> {
	const fromPerspective = perspectiveContactId === endpoints.fromContactId;
	const targetId = fromPerspective ? endpoints.toContactId : endpoints.fromContactId;
	const { facts, nameOf } = await loadExclusionCheck(deps, viewer, perspectiveContactId);
	const exclusion = exclusionFor(facts, {
		subjectId: perspectiveContactId,
		targetId,
		type: { key: type.key, category: type.category },
		side: fromPerspective ? 'forward' : 'reverse',
		exceptId
	});
	if (exclusion) {
		throw new RelationshipExcludedError(exclusion, nameOf);
	}
}
