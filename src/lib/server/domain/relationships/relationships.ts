import { TranslatableError } from '../../../i18n/translatable';
import { phrase } from '../../../i18n/phrase';
import type { Viewer } from '../../access/visibility';
import type { RelationshipCategory } from '../../../relationships/categories';
import { relationshipPair, type Endpoints } from '../../../relationships/endpoints';
import { GENERATION_TYPE_KEYS } from '../../../relationships/type-keys';
import {
	parseRelationshipDetails,
	type RelationshipDetails,
	type RelationshipDetailsInput
} from './details';
import { guardExclusions, type ExclusionSource } from './exclusions';
import type { KinshipGraphReads } from './suggestion-review';
import {
	InvalidRelationshipTypeError,
	type RelationshipTypeRepository
} from './relationship-types';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';

/*
 * Relationship domain (docs/02 §2.4). Pure helpers for canonical storage direction and
 * perspective-aware labels, the repository port, and creating and removing a link. Beside it:
 * `details.ts` checks what a link carries, `exclusions.ts` what the records rule out,
 * `edit.ts` corrects a link, and `kinship.ts` reads the kin that follow from the links.
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

/** The canonical storage direction (`relationshipPair`), as plain endpoints. */
export function canonicalEndpoints(fromId: string, toId: string, symmetric: boolean): Endpoints {
	return relationshipPair(fromId, toId, symmetric);
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

/**
 * The links between people, as the store writes them, plus the one-record reads those writes
 * rest on (docs/08 §8.3). What a screen lists is a read model: a person's ties
 * (`RelationshipTieReads`), the kinship graph (`KinshipGraphReads`).
 */
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
	/** Stores every one of them or, should any fail, none: one transaction (docs/02 §2.4). */
	insertAll(relationships: readonly NewRelationship[]): Promise<void>;
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
	/**
	 * Deletes all of them in one transaction — the undo of a batch added together. False, and
	 * nothing deleted, when any one is not there or not visible to the viewer.
	 */
	removeAllVisibleTo(viewer: Viewer, ids: readonly string[]): Promise<boolean>;
}

/** A person's links as their page lists them — the read model of the People card. */
export interface RelationshipTieReads {
	/** Every link of `contactId` whose far end the viewer may see, read from their side. */
	listForContactVisibleTo(viewer: Viewer, contactId: string): Promise<RelationshipView[]>;
}

/** Everything creating, editing and removing a link reads and writes, as the edge hands it over. */
export interface RelationshipDeps {
	relationships: RelationshipRepository;
	/** The household's graph and the subject's ties, which the exclusion rules judge against. */
	kinship: KinshipGraphReads;
	ties: RelationshipTieReads;
	/** Only the type lookup: creating a link resolves its type, nothing more. */
	types: Pick<RelationshipTypeRepository, 'getType'>;
	ids: IdGenerator;
	clock: Clock;
}

/**
 * What creating one link reads and writes — narrower than `RelationshipDeps`, so a batch can
 * put its own staging in front of the store and have every link judged against the links
 * picked before it (`add-many.ts`).
 */
export interface CreateRelationshipDeps extends ExclusionSource {
	relationships: Pick<RelationshipRepository, 'exists' | 'insert'>;
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

/**
 * Create a relationship between two contacts. Validates the type, rejects self links,
 * stores in canonical direction, prevents duplicates and refuses a generation claimed in
 * both directions. Endpoint visibility must be checked by the caller (the route loads both
 * contacts through the visibility scope).
 */
export async function createRelationship(
	deps: CreateRelationshipDeps,
	viewer: Viewer,
	input: CreateRelationshipInput
): Promise<string> {
	const type = await deps.types.getType(viewer, input.typeId);
	if (!type) throw new InvalidRelationshipTypeError(phrase('errors.relationshipType.gone'));
	const details = parseRelationshipDetails(input);

	const { fromContactId, toContactId } = relationshipPair(
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
 * Take back several links at once — the undo of a batch added together (docs/02 §2.4), so one
 * *Undo* removes them all or, when any is gone or out of sight, none.
 */
export async function removeRelationships(
	deps: { relationships: Pick<RelationshipRepository, 'removeAllVisibleTo'> },
	viewer: Viewer,
	relationshipIds: readonly string[]
): Promise<boolean> {
	if (relationshipIds.length === 0) return false;
	return deps.relationships.removeAllVisibleTo(viewer, relationshipIds);
}

/** Take back a link that was entered wrong. False when the viewer may not see it. */
export async function removeRelationship(
	deps: { relationships: Pick<RelationshipRepository, 'removeVisibleTo'> },
	viewer: Viewer,
	relationshipId: string
): Promise<boolean> {
	return deps.relationships.removeVisibleTo(viewer, relationshipId);
}
