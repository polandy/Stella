import type { Locale } from '../../../../i18n/locales';
import type { Visibility } from '../../../access/visibility';
import type { KinshipGraph } from '../../../../kinship/kinship';
import {
	exclusionFor,
	type ExclusionReason,
	type SubjectTie
} from '../../../../relationships/exclusions';
import { CURRENT_RELATIONSHIP_STATUS } from '../../../../relationships/status';
import {
	GENERATION_TYPE_KEYS,
	PARENT_CHILD_TYPE_KEY,
	PARTNER_TYPE_KEYS,
	SIBLING_TYPE_KEY
} from '../../../../relationships/type-keys';
import type { CircleKind, NewCircle } from '../../circles/circles';
import type { ContactFieldKind } from '../../../../people/contact-fields';
import type { NewContactField } from '../../contact-fields/contact-fields';
import type { NewContact } from '../../contacts/contacts';
import { partialDateOfDay } from '../../../../dates/partial-date';
import { deriveDisplayName } from '../../../../people/display-name';
import type { NewRelationship, RelationshipType } from '../../relationships/relationships';
import { relationshipPair } from '../../../../relationships/endpoints';
import {
	circleIdFor,
	fieldIdFor,
	isExistingCircle,
	isExistingPerson,
	personIdFor,
	relationshipIdFor,
	type ApiContactField,
	type ApiImportDocument
} from './document';
import type { NewHome } from '../../homes/homes';
import { planCircles } from './plan-circles';
import { planHomes } from './plan-homes';
import { orNull } from './text';

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

// ── People ────────────────────────────────────────────────────────────────

function planPeople(
	document: ApiImportDocument,
	context: ApiImportContext,
	problems: ApiImportProblem[]
) {
	const { source } = document;
	const visibility = document.visibility ?? context.defaultVisibility;
	const stamps = { createdAt: context.now, updatedAt: context.now };
	const idByRef = new Map<string, string>();
	const contacts: NewContact[] = [];
	const fields: NewContactField[] = [];
	const report: ApiImportReport['people'] = [];
	/** The people this sending creates, for the look-alike check. */
	const created: { ref: string; contact: NewContact }[] = [];
	let fieldsAlreadyThere = 0;
	const fieldRow = (ref: string, contactId: string, field: ApiContactField, position: number) => ({
		id: fieldIdFor(source, ref, position),
		contactId,
		kind: field.kind,
		label: orNull(field.label),
		value: field.value.trim(),
		meta: null,
		...stamps
	});

	document.people.forEach((entry, index) => {
		const at = `people[${index}]`;
		if (idByRef.has(entry.ref)) {
			problems.push({ code: 'duplicateRef', path: `${at}.ref`, ref: entry.ref });
			return;
		}

		if (isExistingPerson(entry)) {
			const known = context.people.get(entry.existingId);
			if (!known) {
				problems.push({ code: 'personNotFound', path: `${at}.existingId`, id: entry.existingId });
				return;
			}
			idByRef.set(entry.ref, known.id);
			const held = context.fieldsOf.get(known.id) ?? [];
			const completing = missingFields(entry.fields, held, (at) =>
				fieldIdFor(source, entry.ref, at)
			);
			fieldsAlreadyThere += entry.fields.length - completing.length;
			const after = Math.max(-1, ...held.map((f) => f.sortOrder));
			completing.forEach(({ field, position }, k) => {
				fields.push({
					...fieldRow(entry.ref, known.id, field, position),
					sortOrder: after + 1 + k
				});
			});
			report.push({
				ref: entry.ref,
				id: known.id,
				displayName: known.displayName,
				status: 'existing',
				fieldsAdded: completing.length
			});
			return;
		}

		const id = personIdFor(source, entry.ref);
		if (context.hiddenIds.has(id)) {
			problems.push({ code: 'idTaken', path: `${at}.ref`, ref: entry.ref });
			return;
		}
		idByRef.set(entry.ref, id);

		const sentBefore = context.people.get(id);
		if (sentBefore) {
			report.push({
				ref: entry.ref,
				id,
				displayName: sentBefore.displayName,
				status: 'imported',
				fieldsAdded: 0
			});
			return;
		}

		const birthDate = orNull(entry.birthDate);
		const contact: NewContact = {
			id,
			householdId: context.householdId,
			createdBy: context.actorId,
			visibility,
			displayName: deriveDisplayName(entry, context.locale),
			firstName: orNull(entry.firstName),
			lastName: orNull(entry.lastName),
			nickname: orNull(entry.nickname),
			description: orNull(entry.description),
			howWeMet: null,
			metDate: null,
			metPlace: null,
			birthDate,
			// The document's shape check let only a day through; no birth date stores as `full`.
			birthDatePrecision:
				(birthDate === null ? null : partialDateOfDay(birthDate)?.precision) ?? 'full',
			gender: null,
			...stamps
		};
		contacts.push(contact);
		created.push({ ref: entry.ref, contact });
		report.push({
			ref: entry.ref,
			id,
			displayName: contact.displayName,
			status: 'new',
			fieldsAdded: entry.fields.length
		});
		entry.fields.forEach((field, position) => {
			fields.push({ ...fieldRow(entry.ref, id, field, position), sortOrder: position });
		});
	});

	return { idByRef, contacts, fields, report, created, fieldsAlreadyThere };
}

/** A value as two spellings of it share it: no case, single spaces. */
const fieldKey = (kind: ContactFieldKind, value: string) =>
	`${kind}:${value.trim().replace(/\s+/g, ' ').toLowerCase()}`;

/**
 * The fields a document hands someone already in Stella that they do not have yet, each with
 * its position in the entry (its id). A field this document added before is there under its
 * id even if the value was corrected by hand since, so re-sending never brings the old one back.
 */
function missingFields(
	sent: readonly ApiContactField[],
	held: readonly KnownField[],
	idAt: (position: number) => string
): { field: ApiContactField; position: number }[] {
	const heldIds = new Set(held.map((f) => f.id));
	const seen = new Set(held.map((f) => fieldKey(f.kind, f.value)));
	return sent.flatMap((field, position) => {
		const key = fieldKey(field.kind, field.value);
		if (heldIds.has(idAt(position)) || seen.has(key)) return [];
		seen.add(key);
		return [{ field, position }];
	});
}

/** A name reduced to what two spellings of it share: no case, no accents, any word order. */
function nameKey(name: string): string {
	return name
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean)
		.sort()
		.join(' ');
}

function possibleDuplicates(
	created: { ref: string; contact: NewContact }[],
	context: ApiImportContext
): ApiImportReport['possibleDuplicates'] {
	const byName = new Map<string, KnownPerson[]>();
	for (const known of context.directory) {
		const key = nameKey(known.displayName);
		byName.set(key, [...(byName.get(key) ?? []), known]);
	}
	// Only people this sending creates are looked at: someone sent before is in the directory
	// under their own id and would otherwise be pointed at themselves.
	return created.flatMap(({ ref, contact }) => {
		const candidates = byName.get(nameKey(contact.displayName)) ?? [];
		return candidates.length > 0 ? [{ ref, candidates }] : [];
	});
}

// ── Relationships ─────────────────────────────────────────────────────────

/** A link on record or accepted earlier in the document, as the guardrails read it. */
interface Link {
	id: string;
	fromContactId: string;
	toContactId: string;
	type: RelationshipType;
	former: boolean;
}

const sameDirection = (link: Link, from: string, to: string, typeId: string) =>
	link.type.id === typeId && link.fromContactId === from && link.toContactId === to;

/** The link as the subject's profile reads it. */
const tieOf = (link: Link, subjectId: string): SubjectTie => {
	const forward = link.fromContactId === subjectId;
	return {
		relationshipId: link.id,
		otherContactId: forward ? link.toContactId : link.fromContactId,
		category: link.type.category,
		typeKey: link.type.key,
		side: forward ? 'forward' : 'reverse',
		label: forward ? link.type.forwardLabel : link.type.reverseLabel
	};
};

/** The household's graph with the document's people and accepted links added. */
function graphWith(
	graph: KinshipGraph,
	people: Iterable<string>,
	accepted: readonly Link[]
): KinshipGraph {
	const known = new Set(graph.people.map((p) => p.id));
	const added = [...people].filter((id) => !known.has(id)).map((id) => ({ id, displayName: id }));
	const pairs = accepted.map((l) => ({ a: l.fromContactId, b: l.toContactId }));
	return {
		people: [...graph.people, ...added],
		parentEdges: [
			...graph.parentEdges,
			...accepted
				.filter((l) => l.type.key === PARENT_CHILD_TYPE_KEY)
				.map((l) => ({ parentId: l.fromContactId, childId: l.toContactId }))
		],
		siblingEdges: [
			...graph.siblingEdges,
			...accepted
				.filter((l) => l.type.key === SIBLING_TYPE_KEY)
				.map((l) => ({ a: l.fromContactId, b: l.toContactId }))
		],
		partnerEdges: [
			...graph.partnerEdges,
			...accepted
				.filter((l) => PARTNER_TYPE_KEYS.includes(l.type.key))
				.map((l) => ({ a: l.fromContactId, b: l.toContactId }))
		],
		storedPairs: [...graph.storedPairs, ...pairs]
	};
}

function planRelationships(
	document: ApiImportDocument,
	context: ApiImportContext,
	idByRef: ReadonlyMap<string, string>,
	problems: ApiImportProblem[]
) {
	const typeById = new Map(context.types.map((t) => [t.id, t]));
	// A built-in wins a key the household happens to reuse: the built-ins are what the
	// guardrails and the kinship engine know by key.
	const typeByKey = new Map<string, RelationshipType>();
	for (const type of context.types) {
		const held = typeByKey.get(type.key);
		if (!held || (held.householdId !== null && type.householdId === null))
			typeByKey.set(type.key, type);
	}
	const refById = new Map([...idByRef].map(([ref, id]) => [id, ref]));

	const onRecord: Link[] = context.links.flatMap((l) => {
		const type = typeById.get(l.typeId);
		return type
			? [
					{
						id: l.id,
						fromContactId: l.fromContactId,
						toContactId: l.toContactId,
						type,
						former: l.former
					}
				]
			: [];
	});
	const accepted: Link[] = [];
	const rows: NewRelationship[] = [];
	let alreadyThere = 0;

	document.relationships.forEach((entry, index) => {
		const at = `relationships[${index}]`;
		const from = idByRef.get(entry.from);
		const to = idByRef.get(entry.to);
		const type = typeByKey.get(entry.type);
		if (from === undefined)
			problems.push({ code: 'unknownRef', path: `${at}.from`, ref: entry.from });
		if (to === undefined) problems.push({ code: 'unknownRef', path: `${at}.to`, ref: entry.to });
		if (!type)
			problems.push({ code: 'unknownRelationshipType', path: `${at}.type`, type: entry.type });
		if (from === undefined || to === undefined || !type) return;
		if (from === to) {
			problems.push({ code: 'selfRelationship', path: at });
			return;
		}

		const endpoints = relationshipPair(from, to, type.symmetric);
		const stored = (link: Link) =>
			sameDirection(link, endpoints.fromContactId, endpoints.toContactId, type.id);
		if (accepted.some(stored)) {
			problems.push({ code: 'duplicateRelationship', path: at });
			return;
		}
		if (onRecord.some(stored)) {
			alreadyThere++;
			return;
		}
		const flipped = (link: Link) =>
			sameDirection(link, endpoints.toContactId, endpoints.fromContactId, type.id);
		if (GENERATION_TYPE_KEYS.includes(type.key) && [...onRecord, ...accepted].some(flipped)) {
			problems.push({ code: 'relationshipContradiction', path: at });
			return;
		}

		const everything = [...onRecord, ...accepted];
		const touching = (id: string) => (l: Link) => l.fromContactId === id || l.toContactId === id;
		const graph = graphWith(context.graph, idByRef.values(), accepted);
		const exclusion = exclusionFor(
			{
				subjectTies: everything.filter(touching(from)).map((l) => tieOf(l, from)),
				romanticPairs: graph.partnerEdges.filter((e) => !e.former).map((e) => ({ a: e.a, b: e.b })),
				parentEdges: graph.parentEdges
			},
			{
				subjectId: from,
				targetId: to,
				type: { key: type.key, category: type.category },
				side: endpoints.fromContactId === from ? 'forward' : 'reverse'
			}
		);
		if (exclusion) {
			problems.push({
				code: 'relationshipExcluded',
				path: at,
				reason: exclusion.reason,
				personId: exclusion.personId
			});
			return;
		}

		const id = relationshipIdFor(
			document.source,
			refById.get(endpoints.fromContactId) ?? endpoints.fromContactId,
			type.key,
			refById.get(endpoints.toContactId) ?? endpoints.toContactId
		);
		accepted.push({ id, ...endpoints, type, former: false });
		rows.push({
			id,
			householdId: context.householdId,
			...endpoints,
			typeId: type.id,
			description: null,
			sinceDate: null,
			status: CURRENT_RELATIONSHIP_STATUS,
			createdBy: context.actorId,
			createdAt: context.now,
			updatedAt: context.now
		});
	});

	return { rows, alreadyThere };
}
