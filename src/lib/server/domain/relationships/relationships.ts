import type { Viewer } from '../../access/visibility';
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

export interface NewRelationship {
	id: string;
	householdId: string;
	fromContactId: string;
	toContactId: string;
	typeId: string;
	description: string | null;
	createdBy: string;
	createdAt: number;
	updatedAt: number;
}

/** One relationship as shown on a contact's profile, already resolved to that perspective. */
export interface RelationshipView {
	id: string;
	otherContactId: string;
	otherDisplayName: string;
	label: string;
	category: RelationshipCategory;
	description: string | null;
}

export interface RelationshipRepository {
	listTypes(): Promise<RelationshipType[]>;
	getType(typeId: string): Promise<RelationshipType | null>;
	exists(fromContactId: string, toContactId: string, typeId: string): Promise<boolean>;
	insert(relationship: NewRelationship): Promise<void>;
	listForContactVisibleTo(viewer: Viewer, contactId: string): Promise<RelationshipView[]>;
}

export interface RelationshipDeps {
	relationships: RelationshipRepository;
	ids: IdGenerator;
	clock: Clock;
}

export interface CreateRelationshipInput {
	fromContactId: string;
	toContactId: string;
	typeId: string;
	description?: string | null;
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
		description: (input.description ?? '').trim() || null,
		createdBy,
		createdAt: now,
		updatedAt: now
	});
	return id;
}
