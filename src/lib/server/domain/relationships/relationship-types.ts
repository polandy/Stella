import { TranslatableError } from '../../../errors/translatable';
import { phrase, type Phrase } from '../../../i18n/phrase';
import type { IdGenerator } from '../../id';
import type { Viewer } from '../../access/visibility';
import {
	RELATIONSHIP_CATEGORIES,
	type RelationshipCategory
} from '../../../relationships/categories';
import {
	PARENT_CHILD_TYPE_KEY,
	PARTNER_TYPE_KEYS,
	SIBLING_TYPE_KEY
} from '../../../relationships/type-keys';
import type { RelationshipType } from './relationships';

/*
 * Custom relationship types (docs/02 §2.4): a household names a kind of link the built-in
 * set does not cover — godparent, choir mate, landlord. The built-in types stay read-only
 * for everyone, so a deployment's vocabulary can grow without anyone being able to redefine
 * what "Parent of" means.
 */

/** Labels are shown inline on a relationship row; past this they stop being labels. */
const MAX_LABEL_LENGTH = 80;

/** Where custom types sort: after every built-in one (which occupy 0…11). */
export const CUSTOM_TYPE_SORT_ORDER = 100;

/**
 * Keys `kinship-graph-read` switches on to feed the inference engine. A custom type
 * carrying one would be read as a parent, sibling or partner link and would silently invent
 * derived relatives, so the household cannot mint one — even though the built-in types
 * already occupy these keys today.
 */
const RESERVED_TYPE_KEYS: readonly string[] = [
	PARENT_CHILD_TYPE_KEY,
	SIBLING_TYPE_KEY,
	...PARTNER_TYPE_KEYS
];

/** A relationship type as entered; the machine key is derived, never typed. */
export interface RelationshipTypeInput {
	forwardLabel: string;
	reverseLabel: string;
	category: string;
	symmetric: boolean;
}

/** The checked, storable fields of a relationship type. */
export interface RelationshipTypeFields {
	forwardLabel: string;
	reverseLabel: string;
	category: RelationshipCategory;
	symmetric: boolean;
}

/** A relationship type could not be accepted as entered; the message names what is wrong. */
export class InvalidRelationshipTypeError extends TranslatableError {
	constructor(message: Phrase) {
		super(message, 'InvalidRelationshipTypeError');
	}
}

/** The built-in types are part of the app, not of a household's data. */
export class BuiltInRelationshipTypeError extends TranslatableError {
	constructor() {
		super(phrase('errors.relationshipType.builtIn'), 'BuiltInRelationshipTypeError');
	}
}

/** Relationships still point at this type, so it cannot be removed or reshaped. */
export class RelationshipTypeInUseError extends TranslatableError {
	constructor(readonly count: number) {
		super(phrase('errors.relationshipType.inUse', { count }), 'RelationshipTypeInUseError');
	}
}

const isCategory = (value: string): value is RelationshipCategory =>
	(RELATIONSHIP_CATEGORIES as readonly string[]).includes(value);

/**
 * Check and normalise what was entered. A symmetric type reads the same from both ends, so
 * it carries one label on both sides rather than letting the two disagree.
 */
export function parseRelationshipTypeFields(input: RelationshipTypeInput): RelationshipTypeFields {
	const forwardLabel = input.forwardLabel.trim();
	const reverseLabel = input.symmetric ? forwardLabel : input.reverseLabel.trim();
	if (!forwardLabel) {
		throw new InvalidRelationshipTypeError(phrase('errors.relationshipType.needsLabel'));
	}
	if (!reverseLabel) {
		throw new InvalidRelationshipTypeError(phrase('errors.relationshipType.needsBothLabels'));
	}
	if (forwardLabel.length > MAX_LABEL_LENGTH || reverseLabel.length > MAX_LABEL_LENGTH) {
		throw new InvalidRelationshipTypeError(
			phrase('errors.relationshipType.labelTooLong', { max: MAX_LABEL_LENGTH })
		);
	}
	if (!isCategory(input.category)) {
		throw new InvalidRelationshipTypeError(
			phrase('errors.relationshipType.unknownCategory', { category: input.category })
		);
	}
	return { forwardLabel, reverseLabel, category: input.category, symmetric: input.symmetric };
}

/** What a name has to be free of: the types this household can already use. */
export type ExistingTypeName = Pick<RelationshipType, 'id' | 'key' | 'forwardLabel'>;

const slugOf = (label: string): string =>
	label
		.normalize('NFD')
		.replace(/\p{M}+/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');

/**
 * Claims a name for a type and returns the machine key derived from it — accents folded,
 * everything else that is not a letter or digit collapsed to `_` — so nobody has to invent a
 * key. Refuses a name the household can already use, by its label as well as by its key: a
 * built-in type's key need not match its label (`friend` is labelled "Friend of"), so
 * checking only the key would let a second, indistinguishable "Friend of" into the picker.
 * Refuses the four keys the kinship engine owns, too. `exceptId` is the type being renamed,
 * which does not collide with itself.
 */
export function claimTypeKey(
	forwardLabel: string,
	existing: readonly ExistingTypeName[],
	exceptId: string | null = null
): string {
	const key = slugOf(forwardLabel);
	if (!key) {
		throw new InvalidRelationshipTypeError(
			phrase('errors.relationshipType.unnameable', { label: forwardLabel })
		);
	}
	const taken = existing.some(
		(type) =>
			type.id !== exceptId &&
			(type.key === key || type.forwardLabel.toLowerCase() === forwardLabel.toLowerCase())
	);
	if (RESERVED_TYPE_KEYS.includes(key) || taken) {
		throw new InvalidRelationshipTypeError(
			phrase('errors.relationshipType.taken', { label: forwardLabel })
		);
	}
	return key;
}

/** A custom type as it is stored. */
export interface NewRelationshipType extends RelationshipTypeFields {
	id: string;
	householdId: string;
	key: string;
	sortOrder: number;
}

/** Reading and writing the relationship vocabulary (docs/08 §8.3). */
export interface RelationshipTypeRepository {
	/** The built-in types plus the viewer's own household's; never another household's. */
	listTypes(viewer: Viewer): Promise<RelationshipType[]>;
	/** Resolves a type the viewer's household may use, else null (docs/03 §3.6). */
	getType(viewer: Viewer, typeId: string): Promise<RelationshipType | null>;
	insertType(type: NewRelationshipType): Promise<void>;
	/** Rewrites a custom type of the viewer's household; false when there is none to rewrite. */
	updateTypeVisibleTo(
		viewer: Viewer,
		typeId: string,
		fields: RelationshipTypeFields
	): Promise<boolean>;
	/** Deletes a custom type of the viewer's household; false when there is none to delete. */
	deleteTypeVisibleTo(viewer: Viewer, typeId: string): Promise<boolean>;
	/** How many relationships the viewer may see are stored under this type. */
	countRelationshipsOfType(viewer: Viewer, typeId: string): Promise<number>;
}

export interface RelationshipTypeDeps {
	types: RelationshipTypeRepository;
	ids: IdGenerator;
}

/** Add a relationship type this household can then use like any built-in one. */
export async function createRelationshipType(
	deps: RelationshipTypeDeps,
	viewer: Viewer,
	input: RelationshipTypeInput
): Promise<string> {
	const fields = parseRelationshipTypeFields(input);
	const key = claimTypeKey(fields.forwardLabel, await deps.types.listTypes(viewer));
	const id = deps.ids.next();
	await deps.types.insertType({
		id,
		householdId: viewer.householdId,
		key,
		...fields,
		sortOrder: CUSTOM_TYPE_SORT_ORDER
	});
	return id;
}

/**
 * Rename or recategorise a custom type. The key stays as it was — it is the machine name,
 * and rewriting it would orphan nothing but would make the row a different thing.
 */
export async function editRelationshipType(
	deps: RelationshipTypeDeps,
	viewer: Viewer,
	typeId: string,
	input: RelationshipTypeInput
): Promise<boolean> {
	const existing = await deps.types.getType(viewer, typeId);
	if (!existing) return false;
	if (existing.householdId === null) throw new BuiltInRelationshipTypeError();

	const fields = parseRelationshipTypeFields(input);
	// A rename has to claim its new name too — the key stays as it was, but the label is what
	// the household reads in the picker, and two of the same would be indistinguishable.
	claimTypeKey(fields.forwardLabel, await deps.types.listTypes(viewer), typeId);
	if (fields.symmetric !== existing.symmetric) {
		// Symmetry decides the canonical storage direction (`canonicalEndpoints`), so flipping
		// it would strand the rows already written the other way round.
		const count = await deps.types.countRelationshipsOfType(viewer, typeId);
		if (count > 0) throw new RelationshipTypeInUseError(count);
	}
	return deps.types.updateTypeVisibleTo(viewer, typeId, fields);
}

/** Remove a custom type. Refuses while relationships are still stored under it. */
export async function removeRelationshipType(
	deps: RelationshipTypeDeps,
	viewer: Viewer,
	typeId: string
): Promise<boolean> {
	const existing = await deps.types.getType(viewer, typeId);
	if (!existing) return false;
	if (existing.householdId === null) throw new BuiltInRelationshipTypeError();

	const count = await deps.types.countRelationshipsOfType(viewer, typeId);
	if (count > 0) throw new RelationshipTypeInUseError(count);
	return deps.types.deleteTypeVisibleTo(viewer, typeId);
}
