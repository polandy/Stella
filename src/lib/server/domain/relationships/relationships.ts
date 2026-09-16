import { TranslatableError } from '../../../errors/translatable';
import { phrase, type Phrase } from '../../../i18n/phrase';
import type { KinshipGraph, Pair } from '../../../kinship/kinship';
import { deriveKinship, type DerivedKin } from '../../../kinship/kinship';
import { evaluate } from '../../../suggestions/engine';
import type { PrimaryLink } from '../../../suggestions/types';
import { buildView } from '../../../suggestions/view';
import { nameProposals, type ProposedLink, type SuggestionReviewSource } from './suggestion-review';
import type { Viewer } from '../../access/visibility';
import type { RelationshipCategory } from '../../../relationships/categories';
import type { Endpoints } from '../../../relationships/endpoints';
import { endpointsForSide, type RelationshipSide } from '../../../relationships/type-options';
import {
	exclusionFor,
	MAX_PARENTS,
	type Exclusion,
	type ExclusionFacts,
	type ExclusionReason
} from '../../../relationships/exclusions';
import { relationshipRowLabel } from '../../../relationships/labels';
import { GENERATION_TYPE_KEYS } from '../../../relationships/type-keys';
import { RELATIONSHIP_STATUSES, type RelationshipStatus } from '../../../relationships/status';
import { FULL_DATE_SHAPE, isRealCalendarDay } from '../../../dates/calendar';
import type { RelationshipTypeRepository } from './relationship-types';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';

/*
 * Relationship domain (docs/02 §2.4). Pure helpers for canonical storage direction and
 * perspective-aware labels, plus the createRelationship use-case over a repository port.
 */

export interface RelationshipType {
	id: string;
	/** null for the built-in set; the owning household for a custom type (docs/03 §3.6). */
	householdId: string | null;
	key: string;
	forwardLabel: string;
	reverseLabel: string;
	category: RelationshipCategory;
	symmetric: boolean;
	sortOrder: number;
}

export type { Endpoints };

/**
 * Canonical storage direction. Symmetric links are stored order-independently (endpoint
 * ids sorted) so duplicates collide regardless of input order; asymmetric links keep the
 * given order (from = forward-label side). Self relationships are rejected.
 */
export function canonicalEndpoints(fromId: string, toId: string, symmetric: boolean): Endpoints {
	if (fromId === toId) {
		throw new Error('A contact cannot have a relationship with themselves.');
	}
	if (symmetric && toId < fromId) {
		return { fromContactId: toId, toContactId: fromId };
	}
	return { fromContactId: fromId, toContactId: toId };
}

export interface RelationshipDescription {
	otherContactId: string;
	label: string;
	/** Which of the type's two labels was read; the edge needs it to translate a built-in. */
	side: 'forward' | 'reverse';
	category: RelationshipCategory;
}

/** Resolve, from the viewed contact's perspective, the other contact and the correct label. */
export function describeRelationshipFor(
	viewedContactId: string,
	endpoints: Endpoints,
	type: RelationshipType
): RelationshipDescription {
	if (viewedContactId === endpoints.fromContactId) {
		return {
			otherContactId: endpoints.toContactId,
			label: type.forwardLabel,
			side: 'forward',
			category: type.category
		};
	}
	if (viewedContactId === endpoints.toContactId) {
		return {
			otherContactId: endpoints.fromContactId,
			label: type.reverseLabel,
			side: 'reverse',
			category: type.category
		};
	}
	throw new Error('The viewed contact is not an endpoint of this relationship.');
}

// ── Use-case ────────────────────────────────────────────────────────────────

/** The specifics a relationship carries beyond its type (docs/02 §2.4). */
export interface RelationshipDetails {
	/** Free text: how these two connect, e.g. "met through Peter at the ski course". */
	description: string | null;
	/** A full ISO day the link dates from, or null. */
	sinceDate: string | null;
	status: RelationshipStatus | null;
}

/** The same three as they arrive from a form: absent, blank and null all mean "not said". */
export interface RelationshipDetailsInput {
	description?: string | null;
	sinceDate?: string | null;
	status?: string | null;
}

export class InvalidRelationshipDetailsError extends TranslatableError {
	constructor(message: Phrase) {
		super(message, 'InvalidRelationshipDetailsError');
	}
}

const blankToNull = (value: string | null | undefined): string | null => (value ?? '').trim() || null;

/**
 * Normalise and check the details, so nothing unreal is ever stored. A since-day must be a
 * whole day that exists: `--06-01` is legal for a birthday but says nothing about *when* a
 * relationship began, and `2019-02-30` would silently roll into March downstream.
 */
export function parseRelationshipDetails(input: RelationshipDetailsInput): RelationshipDetails {
	const sinceDate = blankToNull(input.sinceDate);
	if (sinceDate && !(FULL_DATE_SHAPE.test(sinceDate) && isRealCalendarDay(sinceDate))) {
		throw new InvalidRelationshipDetailsError(
			phrase('errors.relationship.noSuchDay', { day: sinceDate })
		);
	}

	const status = blankToNull(input.status);
	if (status && !RELATIONSHIP_STATUSES.includes(status as RelationshipStatus)) {
		throw new InvalidRelationshipDetailsError(phrase('errors.relationship.currentOrFormer'));
	}

	return {
		description: blankToNull(input.description),
		sinceDate,
		status: status as RelationshipStatus | null
	};
}

export interface NewRelationship extends RelationshipDetails {
	id: string;
	householdId: string;
	fromContactId: string;
	toContactId: string;
	typeId: string;
	createdBy: string;
	createdAt: number;
	updatedAt: number;
}

/** One relationship as shown on a contact's profile, already resolved to that perspective. */
export interface RelationshipView extends RelationshipDetails {
	id: string;
	otherContactId: string;
	otherDisplayName: string;
	/** The label as stored on the type; a built-in one is translated at the edge by its key. */
	label: string;
	/** The type the link carries; the edit form offers the picker preset to it. */
	typeId: string;
	/** The type's machine key, and which of its two labels this row reads. */
	typeKey: string;
	side: 'forward' | 'reverse';
	category: RelationshipCategory;
}

/** A stored link as the domain reads it back, to work out what changing its type would mean. */
export interface StoredRelationship {
	id: string;
	fromContactId: string;
	toContactId: string;
	typeId: string;
}

/** The new type of a link and the direction it is stored in once it carries that type. */
export interface Retype {
	endpoints: Endpoints;
	typeId: string;
}

/** What an edit writes: always the specifics, and the type and direction when those change. */
export interface RelationshipUpdate extends RelationshipDetails {
	/** Null leaves the type and the stored direction as they are. */
	retype: Retype | null;
}

export interface RelationshipRepository {
	/**
	 * Whether this exact direction of this type is stored between the two. `exceptId` leaves
	 * one row out of the answer, so a link being retyped is not measured against itself.
	 */
	exists(
		fromContactId: string,
		toContactId: string,
		typeId: string,
		exceptId?: string
	): Promise<boolean>;
	insert(relationship: NewRelationship): Promise<void>;
	listForContactVisibleTo(viewer: Viewer, contactId: string): Promise<RelationshipView[]>;
	/** The stored link, or null when the viewer may not see it (or it is not there). */
	findVisibleTo(viewer: Viewer, id: string): Promise<StoredRelationship | null>;
	/** Writes the update; false when the viewer may not see the relationship. */
	updateVisibleTo(
		viewer: Viewer,
		id: string,
		update: RelationshipUpdate,
		updatedAt: number
	): Promise<boolean>;
	/** Deletes the link; false when the viewer may not see it. Nothing is written in that case. */
	removeVisibleTo(viewer: Viewer, id: string): Promise<boolean>;
	/** The primary links the viewer may see, as the kinship engine wants them (docs/02 §2.4.1). */
	loadKinshipGraphVisibleTo(viewer: Viewer): Promise<KinshipGraph>;
}

export interface RelationshipDeps {
	relationships: RelationshipRepository;
	/** Only the type lookup: creating a link resolves its type, nothing more. */
	types: Pick<RelationshipTypeRepository, 'getType'>;
	ids: IdGenerator;
	clock: Clock;
}

export interface CreateRelationshipInput extends RelationshipDetailsInput {
	fromContactId: string;
	toContactId: string;
	typeId: string;
	/**
	 * Whose profile the link was entered from. Only the wording of a refusal reads it — which
	 * of the two people a blocking link is described from — so it may be left out, and the
	 * stored `from` end stands in.
	 */
	perspectiveContactId?: string;
}

export class DuplicateRelationshipError extends TranslatableError {
	constructor() {
		super(phrase('errors.relationship.duplicate'), 'DuplicateRelationshipError');
	}
}

/** The same two people, already linked the other way round by a type that runs one way. */
export class ContradictoryRelationshipError extends TranslatableError {
	constructor() {
		super(phrase('errors.relationship.contradiction'), 'ContradictoryRelationshipError');
	}
}

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
const PHRASE_FOR_REASON: Record<ExclusionReason, (exclusion: Exclusion, name: string) => Phrase> =
	{
		alreadyRomantic: (exclusion, name) => {
			const tie = exclusion.tie;
			if (!tie) return phrase('errors.relationship.alreadyRomantic', { name });
			return (t) =>
				t('errors.relationship.alreadyTied', { tie: relationshipRowLabel(t, tie), name });
		},
		siblingDerived: (_exclusion, name) => phrase('errors.relationship.siblingDerived', { name }),
		romanticTaken: (_exclusion, name) => phrase('errors.relationship.romanticTaken', { name }),
		parentsComplete: (_exclusion, name) =>
			phrase('errors.relationship.parentsComplete', { name, max: MAX_PARENTS })
	};

/** A tie that cannot hold beside the ties already on record (docs/02 §2.4). */
export class RelationshipExcludedError extends TranslatableError {
	/** Which rule refused — a caller reacts to the kind, never to the wording. */
	readonly reason: ExclusionReason;

	constructor(exclusion: Exclusion, name: string) {
		super(PHRASE_FOR_REASON[exclusion.reason](exclusion, name), 'RelationshipExcludedError');
		this.reason = exclusion.reason;
	}
}

/** The facts, plus the names to word a refusal with — both cut from the one graph read. */
interface ExclusionCheck {
	facts: ExclusionFacts;
	nameOf: (contactId: string) => string;
}

/**
 * What the exclusion rules need to judge a claim made from `subjectId`'s profile, read from
 * the two snapshots the repository has already scoped to the viewer. Only partnerships that
 * still hold are passed on — that is the escape a household needs, because a marriage marked
 * former stops standing in the way of the next one.
 */
async function loadExclusionCheck(
	deps: Pick<RelationshipDeps, 'relationships'>,
	viewer: Viewer,
	subjectId: string
): Promise<ExclusionCheck> {
	const [graph, ties] = await Promise.all([
		deps.relationships.loadKinshipGraphVisibleTo(viewer),
		deps.relationships.listForContactVisibleTo(viewer, subjectId)
	]);
	const facts: ExclusionFacts = {
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
			.map((edge) => ({ a: edge.a, b: edge.b })),
		parentEdges: graph.parentEdges.map((edge) => ({
			parentId: edge.parentId,
			childId: edge.childId
		})),
		/*
		 * Full siblings only. A half-sibling is derived from a single shared parent, and saying
		 * by hand that those two are siblings adds something the parent link does not say — so
		 * that claim stays offerable.
		 */
		derivedSiblingIds: deriveKinship(graph, subjectId)
			.filter((kin) => kin.term === 'sibling')
			.map((kin) => kin.personId)
	};
	const names = new Map(graph.people.map((person) => [person.id, person.displayName]));
	return { facts, nameOf: (contactId) => names.get(contactId) ?? '' };
}

/** The same reading the write is guarded by, for the picker on the person page. */
export async function readExclusionFacts(
	deps: Pick<RelationshipDeps, 'relationships'>,
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
async function guardExclusions(
	deps: RelationshipDeps,
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
		throw new RelationshipExcludedError(exclusion, nameOf(exclusion.personId));
	}
}

/**
 * Create a relationship between two contacts. Validates the type, rejects self links,
 * stores in canonical direction, prevents duplicates and refuses a generation claimed in
 * both directions. Endpoint visibility must be checked by the caller (the route loads both
 * contacts through the visibility scope).
 */
export async function createRelationship(
	deps: RelationshipDeps,
	viewer: Viewer,
	input: CreateRelationshipInput
): Promise<string> {
	const type = await deps.types.getType(viewer, input.typeId);
	if (!type) {
		throw new Error('Unknown relationship type.');
	}
	const details = parseRelationshipDetails(input);

	const { fromContactId, toContactId } = canonicalEndpoints(
		input.fromContactId,
		input.toContactId,
		type.symmetric
	);

	if (await deps.relationships.exists(fromContactId, toContactId, input.typeId)) {
		throw new DuplicateRelationshipError();
	}

	// A generation runs one way, and the picker offers both of its sides from one screen, so
	// the flipped pair is one wrong click away (docs/02 §2.4).
	if (
		GENERATION_TYPE_KEYS.includes(type.key) &&
		(await deps.relationships.exists(toContactId, fromContactId, input.typeId))
	) {
		throw new ContradictoryRelationshipError();
	}

	await guardExclusions(
		deps,
		viewer,
		{ fromContactId, toContactId },
		type,
		// Whose profile this was entered from, where the caller said; the stored `from` end
		// otherwise, which is the same person for every asymmetric type.
		input.perspectiveContactId ?? fromContactId
	);

	const now = deps.clock.now();
	const id = deps.ids.next();
	await deps.relationships.insert({
		id,
		householdId: viewer.householdId,
		fromContactId,
		toContactId,
		typeId: input.typeId,
		...details,
		createdBy: viewer.id,
		createdAt: now,
		updatedAt: now
	});
	return id;
}

/**
 * Everything the person page shows about inferred kinship (docs/02 §2.4.1): the relatives
 * derived for `subjectId`, and — when a primary link has just been stored between
 * `proposeFor` — the links that follow from it and are not stored yet.
 *
 * One port call serves both, because both read the same graph. Visibility is settled by the
 * repository, so neither a derived label nor a proposal can name someone the viewer may not see.
 */
export type { ProposedLink };

export interface KinshipRead {
	derived: DerivedKin[];
	proposals: ProposedLink[];
}

export async function readKinship(
	deps: SuggestionReviewSource,
	viewer: Viewer,
	subjectId: string,
	proposeFor?: Pair | null
): Promise<KinshipRead> {
	const [graph, dismissals] = await Promise.all([
		deps.relationships.loadKinshipGraphVisibleTo(viewer),
		deps.dismissals.listForHousehold(viewer)
	]);
	const derived = deriveKinship(graph, subjectId);
	const added = proposeFor ? primaryLinkBetween(graph, proposeFor.a, proposeFor.b) : null;
	if (!added) return { derived, proposals: [] };

	// A claim declined once is not offered again, however it is reached (§6.4) — including
	// here, in the instant after the write, where it would otherwise slip past the log.
	const view = buildView(graph, dismissals);
	const proposals = nameProposals(evaluate({ kind: 'link-stored', link: added }, view), view.nameOf);
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

/** One edit of a link that is already there: its specifics, and optionally its type. */
export interface EditRelationshipInput extends RelationshipDetailsInput {
	relationshipId: string;
	/** Whose profile the edit was made from — the chosen side is read from their perspective. */
	perspectiveContactId: string;
	/** The type and the side it was read from; absent leaves the type alone. */
	typeChoice?: { typeId: string; side: RelationshipSide } | null;
}

/** The endpoint of `link` that is not `contactId`, or null when they are not an endpoint. */
function otherEndpointOf(link: StoredRelationship, contactId: string): string | null {
	if (contactId === link.fromContactId) return link.toContactId;
	if (contactId === link.toContactId) return link.fromContactId;
	return null;
}

/**
 * Where a link lands once it carries another type (docs/02 §2.4): the chosen side is read
 * from the profile the edit was made on, and the type decides whether the pair is stored
 * order-independently — so a partner becoming a spouse, and a generation entered the wrong
 * way round, both come out canonical. Null when the viewer is editing from a profile that is
 * not an endpoint of the link.
 *
 * The guards are the ones creating a link passes, with the link itself left out of both:
 * measured against itself, every retype would read as its own duplicate and every flipped
 * generation as its own contradiction.
 */
async function planRetype(
	deps: RelationshipDeps,
	viewer: Viewer,
	current: StoredRelationship,
	perspectiveContactId: string,
	choice: { typeId: string; side: RelationshipSide }
): Promise<Retype | null> {
	const type = await deps.types.getType(viewer, choice.typeId);
	if (!type) {
		throw new Error('Unknown relationship type.');
	}

	const otherContactId = otherEndpointOf(current, perspectiveContactId);
	if (otherContactId === null) return null;

	const asked = endpointsForSide(perspectiveContactId, otherContactId, choice.side);
	const endpoints = canonicalEndpoints(asked.fromContactId, asked.toContactId, type.symmetric);

	if (
		await deps.relationships.exists(
			endpoints.fromContactId,
			endpoints.toContactId,
			type.id,
			current.id
		)
	) {
		throw new DuplicateRelationshipError();
	}
	if (
		GENERATION_TYPE_KEYS.includes(type.key) &&
		(await deps.relationships.exists(
			endpoints.toContactId,
			endpoints.fromContactId,
			type.id,
			current.id
		))
	) {
		throw new ContradictoryRelationshipError();
	}

	await guardExclusions(deps, viewer, endpoints, type, perspectiveContactId, current.id);

	return { endpoints, typeId: type.id };
}

/**
 * Correct a link that is already there (docs/02 §2.4): its specifics, and its type where a
 * tie was named wrongly or has moved on — a partner who became a spouse. Changing the type
 * can flip the stored direction, so the same duplicate and contradiction guards that creating
 * a link passes are re-run here.
 *
 * Returns false when the viewer may not see the relationship — the same answer as for one
 * that does not exist, so no one learns of a link through a private person by editing it.
 */
export async function editRelationship(
	deps: RelationshipDeps,
	viewer: Viewer,
	input: EditRelationshipInput
): Promise<boolean> {
	const details = parseRelationshipDetails(input);

	let retype: Retype | null = null;
	if (input.typeChoice) {
		const current = await deps.relationships.findVisibleTo(viewer, input.relationshipId);
		if (!current) return false;
		retype = await planRetype(
			deps,
			viewer,
			current,
			input.perspectiveContactId,
			input.typeChoice
		);
		if (!retype) return false;
	}

	return deps.relationships.updateVisibleTo(
		viewer,
		input.relationshipId,
		{ ...details, retype },
		deps.clock.now()
	);
}

/** Take back a link that was entered wrong. False when the viewer may not see it. */
export async function removeRelationship(
	deps: RelationshipDeps,
	viewer: Viewer,
	relationshipId: string
): Promise<boolean> {
	return deps.relationships.removeVisibleTo(viewer, relationshipId);
}
