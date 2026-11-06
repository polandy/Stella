import type { Locale } from '../../../../i18n/locales';
import type { Visibility } from '../../../access/visibility';
import type { KinshipGraph } from '../../../../kinship/kinship';
import type { ExclusionReason } from '../../../../relationships/exclusions';
import type { CircleKind, NewCircle } from '../../circles/circles';
import type { ContactFieldKind } from '../../../../people/contact-fields';
import type { NewContactField } from '../../contact-fields/contact-fields';
import type { NewContact } from '../../contacts/contacts';
import type { NewRelationship, RelationshipType } from '../../relationships/relationships';
import {
	circleIdFor,
	isExistingCircle,
	isExistingPerson,
	personIdFor,
	type ApiImportDocument
} from './document';
import type { NewHome } from '../../homes/homes';
import { planCircles } from './plan-circles';
import { planHomes } from './plan-homes';
import { planPeople, possibleDuplicates } from './plan-people';
import { planRelationships } from './plan-relationships';

/*
 * Planning an API import (docs/02 §2.16.1). Pure: the document, plus what the household already
 * holds as the member may see it, in; every row to write and what to tell the caller, out.
 *
 * All or nothing. A document is either planned whole or refused with **every** problem named at
 * its path, so a caller fixes its input in one round instead of discovering the next mistake
 * after the last one is fixed. A refused document writes nothing, not even the good half.
 *
 * Re-sending is a no-op by construction: what a document creates is stored under ids made of its
 * `source` and its refs, and whatever of those is already there is reported and left alone. What
 * this never does is decide that a new person *is* somebody already in the household — a name is
 * not an identity (two people can share one). It points out the look-alikes and leaves the call
 * to whoever sent the document.
 *
 * Links pass the same guardrails as a link entered by hand (`exclusionFor`, docs/02 §2.4), read
 * against the household's record *and* the links earlier in the same document, so a document
 * cannot slip in, three lines apart, what the person page would refuse.
 */

/** Someone the member may see, as the planner needs them. */
export interface KnownPerson {
	id: string;
	displayName: string;
	birthDate: string | null;
}

/** One of the contact fields somebody named by id already has. */
export interface KnownField {
	id: string;
	kind: ContactFieldKind;
	value: string;
	label: string | null;
	/** The address's parts as JSON, kept when the address becomes a home. */
	meta: string | null;
	sortOrder: number;
}

/** A home somebody the document names lives in. */
export interface KnownHome {
	id: string;
	label: string | null;
	value: string;
}

/** A circle the member may see, with its details and who is in it already. */
export interface KnownCircle {
	id: string;
	name: string;
	kind: CircleKind;
	description: string | null;
	startDate: string | null;
	endDate: string | null;
	/** The circle it sits inside; `name` is null when the member may not see that one. */
	parent: { id: string; name: string | null } | null;
	memberIds: readonly string[];
}

/** A stored link touching one of the people the document names. */
export interface KnownLink {
	id: string;
	fromContactId: string;
	toContactId: string;
	typeId: string;
	/** Marked as over; it stays a duplicate, but no longer stands in anyone's way. */
	former: boolean;
}

/** What the household holds, read for this document and scoped to the member sending it. */
export interface ApiImportContext {
	householdId: string;
	actorId: string;
	defaultVisibility: Visibility;
	now: number;
	/** The importing member's language: a nickname in a shown name takes its quote marks. */
	locale: Locale;
	/** Of the contact ids the document names or would create, those the member may see. */
	people: ReadonlyMap<string, KnownPerson>;
	/** The contact fields of each person in `people`, so a document only adds what is missing. */
	fieldsOf: ReadonlyMap<string, readonly KnownField[]>;
	/** The homes each person in `people` lives in. */
	homesOf: ReadonlyMap<string, readonly KnownHome[]>;
	/** Of those ids, the ones taken by a record the member may not see. */
	hiddenIds: ReadonlySet<string>;
	/** Of the circle ids the document names or would create, those the member may see. */
	circles: ReadonlyMap<string, KnownCircle>;
	/**
	 * The parent of **every** circle in the household, those the member may not see included, so
	 * a move cannot close a loop through a hidden one. Only ever answers whether it would.
	 */
	circleParents: ReadonlyMap<string, string | null>;
	/** Every relationship type the member may use: the built-ins and the household's own. */
	types: readonly RelationshipType[];
	/** Stored links touching any of `people`. */
	links: readonly KnownLink[];
	/** The household's primary links, for the guardrails that look beyond the pair. */
	graph: KinshipGraph;
	/** Everyone the member may see, to point out look-alikes. */
	directory: readonly KnownPerson[];
}

/** One thing wrong with a document, at the place it is wrong. Codes are the API's contract. */
export type ApiImportProblem =
	| { code: 'duplicateRef'; path: string; ref: string }
	| { code: 'unknownRef'; path: string; ref: string }
	| { code: 'idTaken'; path: string; ref: string }
	| { code: 'personNotFound'; path: string; id: string }
	| { code: 'circleNotFound'; path: string; id: string }
	| { code: 'unknownRelationshipType'; path: string; type: string }
	| { code: 'selfRelationship'; path: string }
	| { code: 'duplicateRelationship'; path: string }
	| { code: 'relationshipContradiction'; path: string }
	| { code: 'relationshipExcluded'; path: string; reason: ExclusionReason; personId: string }
	| { code: 'duplicateMember'; path: string; ref: string }
	| { code: 'circleCycle'; path: string; ref: string }
	| { code: 'periodBackwards'; path: string }
	| { code: 'homeSelf'; path: string; ref: string }
	| { code: 'homeChain'; path: string; ref: string }
	| { code: 'homeNoAddress'; path: string; ref: string }
	| { code: 'homeAmbiguous'; path: string; ref: string };

/**
 * Whether an entry is created by this document, was created by an earlier sending of it, or
 * points at a record the household already had.
 */
export type ApiImportStatus = 'new' | 'imported' | 'existing';

/** What the caller is told about the plan — the same shape whether or not it was written. */
export interface ApiImportReport {
	people: {
		ref: string;
		id: string;
		displayName: string;
		status: ApiImportStatus;
		/** How many contact fields this sending gives them. */
		fieldsAdded: number;
	}[];
	circles: {
		ref: string;
		id: string;
		/** As it is after this sending. */
		name: string;
		status: ApiImportStatus;
		changes: ApiCircleChanges;
	}[];
	/** New people whose name somebody in the household already has. */
	possibleDuplicates: { ref: string; candidates: KnownPerson[] }[];
	/** Fields, links, memberships and residents left out because the household already has them. */
	alreadyThere: { fields: number; relationships: number; memberships: number; residents: number };
}

/** A parent as the report names it; one the member may not see is only said to be there. */
export type ReportedParent = { id: string; name: string } | { hidden: true };

/** One detail's old and new value. */
export interface Change<T> {
	from: T;
	to: T;
}

/** The details a sending changes on a circle already in Stella, each old → new. */
export interface ApiCircleChanges {
	name?: Change<string>;
	kind?: Change<CircleKind>;
	description?: Change<string | null>;
	startDate?: Change<string | null>;
	endDate?: Change<string | null>;
	parent?: Change<ReportedParent | null>;
}

/** The columns a change writes on a circle already in Stella — only those that change. */
export interface PlannedCircleChange {
	id: string;
	set: Partial<
		Pick<
			PlannedCircle,
			'name' | 'kind' | 'description' | 'startDate' | 'endDate' | 'parentCircleId'
		>
	>;
	updatedAt: number;
}

/** A circle as the import writes it. */
export type PlannedCircle = NewCircle;

/** A membership as the import writes it — with the dates the add-member form does not offer. */
export interface PlannedMembership {
	id: string;
	circleId: string;
	contactId: string;
	role: string | null;
	startDate: string | null;
	endDate: string | null;
	createdBy: string;
	createdAt: number;
	updatedAt: number;
}

/** Someone moving into a home. */
export interface PlannedResident {
	homeId: string;
	contactId: string;
	createdBy: string;
	createdAt: number;
}

/** Every row the import writes, in the order it has to write them. */
export interface ApiImportPlan {
	contacts: NewContact[];
	fields: NewContactField[];
	/** Made of somebody's one address, after the fields so nothing else has to wait for them. */
	homes: NewHome[];
	/** Own addresses that became a home or give way to one, as on a person page. */
	droppedFields: { contactId: string; fieldId: string }[];
	/** Who moves into a home: after the homes and the new people. */
	residents: PlannedResident[];
	relationships: NewRelationship[];
	circles: PlannedCircle[];
	/** After the new circles, so a circle can move inside one this document creates. */
	circleChanges: PlannedCircleChange[];
	memberships: PlannedMembership[];
	report: ApiImportReport;
}

export type ApiImportPlanResult =
	{ ok: true; plan: ApiImportPlan } | { ok: false; problems: ApiImportProblem[] };

/** The ids a document points at or would write, so the household can be read for them. */
export function idsNamedBy(document: ApiImportDocument): {
	contactIds: string[];
	circleIds: string[];
} {
	return {
		contactIds: document.people.map((p) =>
			isExistingPerson(p) ? p.existingId : personIdFor(document.source, p.ref)
		),
		circleIds: document.circles.map((c) =>
			isExistingCircle(c) ? c.existingId : circleIdFor(document.source, c.ref)
		)
	};
}

/** Plan a document against the household. See the module comment. */
export function planApiImport(
	document: ApiImportDocument,
	context: ApiImportContext
): ApiImportPlanResult {
	const problems: ApiImportProblem[] = [];
	const people = planPeople(document, context, problems);
	const homes = planHomes(document, context, people, problems);
	const relationships = planRelationships(document, context, people.idByRef, problems);
	const circles = planCircles(document, context, people.idByRef, problems);
	if (problems.length > 0) return { ok: false, problems };
	return {
		ok: true,
		plan: {
			contacts: people.contacts,
			fields: homes.fields,
			homes: homes.homes,
			droppedFields: homes.droppedFields,
			residents: homes.residents,
			relationships: relationships.rows,
			circles: circles.rows,
			circleChanges: circles.circleChanges,
			memberships: circles.memberships,
			report: {
				people: homes.report,
				circles: circles.report,
				possibleDuplicates: possibleDuplicates(people.created, context),
				alreadyThere: {
					fields: people.fieldsAlreadyThere + homes.fieldsAlreadyThere,
					relationships: relationships.alreadyThere,
					memberships: circles.alreadyThere,
					residents: homes.residentsAlreadyThere
				}
			}
		}
	};
}
