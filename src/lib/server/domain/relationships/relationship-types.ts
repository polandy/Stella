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
export class InvalidRelationshipTypeError extends Error {}

/** The built-in types are part of the app, not of a household's data. */
export class BuiltInRelationshipTypeError extends Error {
	constructor() {
		super('The built-in relationship types cannot be changed or removed.');
	}
}

/** Relationships still point at this type, so it cannot be removed or reshaped. */
export class RelationshipTypeInUseError extends Error {
	constructor(readonly count: number) {
		super(
			`${count} relationship${count === 1 ? '' : 's'} still use this type. Change ${
				count === 1 ? 'it' : 'them'
			} first.`
		);
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
		throw new InvalidRelationshipTypeError('A relationship type needs a label.');
	}
	if (!reverseLabel) {
		throw new InvalidRelationshipTypeError(
			'A type that reads differently from each side needs both labels.'
		);
	}
	if (forwardLabel.length > MAX_LABEL_LENGTH || reverseLabel.length > MAX_LABEL_LENGTH) {
		throw new InvalidRelationshipTypeError(
			`A label is at most ${MAX_LABEL_LENGTH} characters.`
		);
	}
	if (!isCategory(input.category)) {
		throw new InvalidRelationshipTypeError(`${input.category} is not a relationship category.`);
	}
	return { forwardLabel, reverseLabel, category: input.category, symmetric: input.symmetric };
}

/**
 * The stable machine key for a type, derived from its forward label so nobody has to invent
 * one — accents folded, everything else that is not a letter or digit collapsed to `_`.
 * Rejects a key that is already taken in this household or that the kinship engine owns.
 */
export function relationshipTypeKey(forwardLabel: string, takenKeys: readonly string[]): string {
	const key = forwardLabel
		.normalize('NFD')
		.replace(/\p{M}+/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
	if (!key) {
		throw new InvalidRelationshipTypeError(
			`"${forwardLabel}" has no letters or digits to name it by.`
		);
	}
	if (RESERVED_TYPE_KEYS.includes(key) || takenKeys.includes(key)) {
		throw new InvalidRelationshipTypeError(
			`A relationship type named like "${forwardLabel}" already exists.`
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
	const taken = (await deps.types.listTypes(viewer)).map((type) => type.key);
	const key = relationshipTypeKey(fields.forwardLabel, taken);
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
