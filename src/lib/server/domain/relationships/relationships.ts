import type { KinshipGraph, Pair } from '../../../kinship/kinship';
import { deriveKinship, type DerivedKin } from '../../../kinship/kinship';
import { suggestPropagation, type PrimaryLink, type SuggestedLink } from '../../../kinship/propagation';
import type { Viewer } from '../../access/visibility';
import { FULL_DATE_SHAPE, isRealCalendarDay } from '../dates/calendar';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';

/*
 * Relationship domain (docs/02 §2.4). Pure helpers for canonical storage direction and
 * perspective-aware labels, plus the createRelationship use-case over a repository port.
 */

export type RelationshipCategory = 'family' | 'romantic' | 'social' | 'professional' | 'other';

export interface RelationshipType {
	id: string;
	key: string;
	forwardLabel: string;
	reverseLabel: string;
	category: RelationshipCategory;
	symmetric: boolean;
	sortOrder: number;
}

export interface Endpoints {
	fromContactId: string;
	toContactId: string;
}

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
	category: RelationshipCategory;
}

/** Resolve, from the viewed contact's perspective, the other contact and the correct label. */
export function describeRelationshipFor(
	viewedContactId: string,
	endpoints: Endpoints,
	type: RelationshipType
): RelationshipDescription {
	if (viewedContactId === endpoints.fromContactId) {
		return { otherContactId: endpoints.toContactId, label: type.forwardLabel, category: type.category };
	}
	if (viewedContactId === endpoints.toContactId) {
		return { otherContactId: endpoints.fromContactId, label: type.reverseLabel, category: type.category };
	}
	throw new Error('The viewed contact is not an endpoint of this relationship.');
}

// ── Use-case ────────────────────────────────────────────────────────────────

/** Whether the link still holds. Free text would make "ex", "former" and "past" three things. */
export const RELATIONSHIP_STATUSES = ['current', 'former'] as const;

export type RelationshipStatus = (typeof RELATIONSHIP_STATUSES)[number];

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

export class InvalidRelationshipDetailsError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'InvalidRelationshipDetailsError';
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
		throw new InvalidRelationshipDetailsError(`${sinceDate} is not a day that exists.`);
	}

	const status = blankToNull(input.status);
	if (status && !RELATIONSHIP_STATUSES.includes(status as RelationshipStatus)) {
		throw new InvalidRelationshipDetailsError('A relationship is either current or former.');
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
	label: string;
	category: RelationshipCategory;
}

export interface RelationshipRepository {
	listTypes(): Promise<RelationshipType[]>;
	getType(typeId: string): Promise<RelationshipType | null>;
	exists(fromContactId: string, toContactId: string, typeId: string): Promise<boolean>;
	insert(relationship: NewRelationship): Promise<void>;
	listForContactVisibleTo(viewer: Viewer, contactId: string): Promise<RelationshipView[]>;
	/** Writes the specifics; false when the viewer may not see the relationship. */
	updateDetailsVisibleTo(
		viewer: Viewer,
		id: string,
		details: RelationshipDetails,
		updatedAt: number
	): Promise<boolean>;
	/** Deletes the link; false when the viewer may not see it. Nothing is written in that case. */
	removeVisibleTo(viewer: Viewer, id: string): Promise<boolean>;
	/** The primary links the viewer may see, as the kinship engine wants them (docs/02 §2.4.1). */
	loadKinshipGraphVisibleTo(viewer: Viewer): Promise<KinshipGraph>;
}

export interface RelationshipDeps {
	relationships: RelationshipRepository;
	ids: IdGenerator;
	clock: Clock;
}

export interface CreateRelationshipInput extends RelationshipDetailsInput {
	fromContactId: string;
	toContactId: string;
	typeId: string;
}

export class DuplicateRelationshipError extends Error {
	constructor() {
		super('That relationship already exists.');
		this.name = 'DuplicateRelationshipError';
	}
}

/**
 * Create a relationship between two contacts. Validates the type, rejects self links,
 * stores in canonical direction, and prevents duplicates. Endpoint visibility must be
 * checked by the caller (the route loads both contacts through the visibility scope).
 */
export async function createRelationship(
	deps: RelationshipDeps,
	householdId: string,
	createdBy: string,
	input: CreateRelationshipInput
): Promise<string> {
	const type = await deps.relationships.getType(input.typeId);
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

	const now = deps.clock.now();
	const id = deps.ids.next();
	await deps.relationships.insert({
		id,
		householdId,
		fromContactId,
		toContactId,
		typeId: input.typeId,
		...details,
		createdBy,
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
export interface KinshipRead {
	derived: DerivedKin[];
	proposals: ProposedLink[];
}

/** A propagation suggestion with the names the interface needs to phrase it. */
export interface ProposedLink extends SuggestedLink {
	fromName: string;
	toName: string;
}

export async function readKinship(
	deps: Pick<RelationshipDeps, 'relationships'>,
	viewer: Viewer,
	subjectId: string,
	proposeFor?: Pair | null
): Promise<KinshipRead> {
	const graph = await deps.relationships.loadKinshipGraphVisibleTo(viewer);
	const derived = deriveKinship(graph, subjectId);
	const added = proposeFor ? primaryLinkBetween(graph, proposeFor.a, proposeFor.b) : null;
	if (!added) return { derived, proposals: [] };

	const names = new Map(graph.people.map((person) => [person.id, person.displayName]));
	const proposals = suggestPropagation(graph, added).map((link) => ({
		...link,
		fromName: names.get(link.fromId) ?? link.fromId,
		toName: names.get(link.toId) ?? link.toId
	}));
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

/**
 * Correct the specifics of a link that is already there (docs/02 §2.4). The type is not
 * editable: changing it can flip the stored direction and re-opens the duplicate guard, so
 * that is a removal and a fresh entry, not an edit.
 *
 * Returns false when the viewer may not see the relationship — the same answer as for one
 * that does not exist, so no one learns of a link through a private person by editing it.
 */
export async function editRelationshipDetails(
	deps: RelationshipDeps,
	viewer: Viewer,
	relationshipId: string,
	input: RelationshipDetailsInput
): Promise<boolean> {
	const details = parseRelationshipDetails(input);
	return deps.relationships.updateDetailsVisibleTo(
		viewer,
		relationshipId,
		details,
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
