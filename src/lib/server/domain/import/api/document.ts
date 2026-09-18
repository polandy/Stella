import type { Visibility } from '../../../access/visibility';
import type { CircleKind } from '../../circles/circles';
import type { ContactFieldKind } from '../../contact-fields/contact-fields';

/*
 * The document the import API accepts (docs/02 §2.16.1), as the domain reads it once the edge
 * has validated its shape. It is written by another program — a script, an agent reading a
 * class list — so it names people by **refs** it chose itself and never by row ids it would have
 * to invent. A ref is local to the document; together with `source` it becomes the stable id of
 * what it creates, which is what makes sending the same document twice a no-op.
 *
 * Someone already in Stella is named by their id instead (`existingId`), found beforehand
 * through the search endpoint. That is the whole answer to duplicates: the API never guesses
 * that two people with the same name are one, it only points out that they might be.
 */

/** One way to reach somebody, as the profile lists it. */
export interface ApiContactField {
	kind: ContactFieldKind;
	value: string;
	label: string | null;
}

/** A person the document introduces. */
export interface ApiNewPerson {
	ref: string;
	displayName: string | null;
	firstName: string | null;
	lastName: string | null;
	nickname: string | null;
	description: string | null;
	/** `YYYY-MM-DD`, or `--MM-DD` when the year is unknown. */
	birthDate: string | null;
	fields: ApiContactField[];
}

/** A person already in Stella, given a ref so the document can link to them. */
export interface ApiExistingPerson {
	ref: string;
	existingId: string;
}

export type ApiPerson = ApiNewPerson | ApiExistingPerson;

/** A link between two refs, by the key of its relationship type (`parent_child`, `friend`, …). */
export interface ApiRelationship {
	/** The forward-label side: for `parent_child`, the parent. */
	from: string;
	to: string;
	type: string;
}

/** Somebody's place in a circle. */
export interface ApiMembership {
	person: string;
	role: string | null;
	startDate: string | null;
	endDate: string | null;
}

/** A circle the document introduces. */
export interface ApiNewCircle {
	ref: string;
	name: string;
	/** `other` when absent. */
	kind: CircleKind | null;
	description: string | null;
	startDate: string | null;
	endDate: string | null;
	/** The ref of a circle listed **earlier** in the document, which this one sits inside. */
	parent: string | null;
	members: ApiMembership[];
}

/** A circle already in Stella, so the document can add members to it. */
export interface ApiExistingCircle {
	ref: string;
	existingId: string;
	members: ApiMembership[];
}

export type ApiCircle = ApiNewCircle | ApiExistingCircle;

/** The whole request body. */
export interface ApiImportDocument {
	/** Names the batch; with each ref it forms the ids of what is created. */
	source: string;
	/** For every person and circle created; the member's own default when absent. */
	visibility: Visibility | null;
	people: ApiPerson[];
	relationships: ApiRelationship[];
	circles: ApiCircle[];
}

/** Whether a document entry points at someone already in Stella. */
export const isExistingPerson = (person: ApiPerson): person is ApiExistingPerson =>
	'existingId' in person;

/** Whether a document entry points at a circle already in Stella. */
export const isExistingCircle = (circle: ApiCircle): circle is ApiExistingCircle =>
	'existingId' in circle;

/*
 * The ids a document's records are stored under. Readable on purpose — a person's page URL
 * says which import they came from — and joined with `~`, which is unreserved in a URL and so
 * survives being a path segment (the reason the vCard import uses it too, docs/04 §4.9).
 */
const ID_SEPARATOR = '~';
const ID_PREFIX = 'api';

const idOf = (...parts: string[]) => [ID_PREFIX, ...parts].join(ID_SEPARATOR);

/** The stable id of the person a document introduces under `ref`. */
export const personIdFor = (source: string, ref: string) => idOf(source, 'p', ref);

/** The stable id of one of that person's contact fields, by its position in the document. */
export const fieldIdFor = (source: string, ref: string, index: number) =>
	idOf(source, 'p', ref, 'f', String(index));

/** The stable id of a circle the document introduces. */
export const circleIdFor = (source: string, ref: string) => idOf(source, 'c', ref);

/** The stable id of a membership, one per person and circle. */
export const membershipIdFor = (source: string, circleRef: string, personRef: string) =>
	idOf(source, 'm', circleRef, personRef);

/** The stable id of a link, from its stored (canonical) direction. */
export const relationshipIdFor = (
	source: string,
	fromRef: string,
	typeKey: string,
	toRef: string
) => idOf(source, 'r', fromRef, typeKey, toRef);
