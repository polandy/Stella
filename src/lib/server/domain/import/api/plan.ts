import type { Visibility } from '../../../access/visibility';
import { deriveKinship, type KinshipGraph } from '../../../../kinship/kinship';
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
import { resolveCircleColor, resolveCircleKind, type NewCircle } from '../../circles/circles';
import type { NewContactField } from '../../contact-fields/contact-fields';
import type { NewContact } from '../../contacts/contacts';
import { deriveDisplayName } from '../../contacts/display-name';
import {
	canonicalEndpoints,
	type NewRelationship,
	type RelationshipType
} from '../../relationships/relationships';
import {
	circleIdFor,
	fieldIdFor,
	isExistingCircle,
	isExistingPerson,
	membershipIdFor,
	personIdFor,
	relationshipIdFor,
	type ApiImportDocument
} from './document';

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

/** A circle the member may see, with who is in it already. */
export interface KnownCircle {
	id: string;
	name: string;
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
	/** Of the contact ids the document names or would create, those the member may see. */
	people: ReadonlyMap<string, KnownPerson>;
	/** Of those ids, the ones taken by a record the member may not see. */
	hiddenIds: ReadonlySet<string>;
	/** Of the circle ids the document names or would create, those the member may see. */
	circles: ReadonlyMap<string, KnownCircle>;
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
	| { code: 'duplicateMember'; path: string; ref: string };

/**
 * Whether an entry is created by this document, was created by an earlier sending of it, or
 * points at a record the household already had.
 */
export type ApiImportStatus = 'new' | 'imported' | 'existing';

/** What the caller is told about the plan — the same shape whether or not it was written. */
export interface ApiImportReport {
	people: { ref: string; id: string; displayName: string; status: ApiImportStatus }[];
	circles: { ref: string; id: string; name: string; status: ApiImportStatus }[];
	/** New people whose name somebody in the household already has. */
	possibleDuplicates: { ref: string; candidates: KnownPerson[] }[];
	/** Links and memberships left out because the household already has them. */
	alreadyThere: { relationships: number; memberships: number };
}

/** A circle as the import writes it — with the parent the create form does not offer. */
export interface PlannedCircle extends NewCircle {
	parentCircleId: string | null;
}

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

/** Every row the import writes, in the order it has to write them. */
export interface ApiImportPlan {
	contacts: NewContact[];
	fields: NewContactField[];
	relationships: NewRelationship[];
	circles: PlannedCircle[];
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
	const relationships = planRelationships(document, context, people.idByRef, problems);
	const circles = planCircles(document, context, people.idByRef, problems);
	if (problems.length > 0) return { ok: false, problems };
	return {
		ok: true,
		plan: {
			contacts: people.contacts,
			fields: people.fields,
			relationships: relationships.rows,
			circles: circles.rows,
			memberships: circles.memberships,
			report: {
				people: people.report,
				circles: circles.report,
				possibleDuplicates: possibleDuplicates(people.created, context),
				alreadyThere: {
					relationships: relationships.alreadyThere,
					memberships: circles.alreadyThere
				}
			}
		}
	};
}

// ── People ────────────────────────────────────────────────────────────────

const orNull = (value: string | null): string | null => {
	const trimmed = (value ?? '').trim();
	return trimmed.length > 0 ? trimmed : null;
};

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
			report.push({
				ref: entry.ref,
				id: known.id,
				displayName: known.displayName,
				status: 'existing'
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
			report.push({ ref: entry.ref, id, displayName: sentBefore.displayName, status: 'imported' });
			return;
		}

		const birthDate = orNull(entry.birthDate);
		const contact: NewContact = {
			id,
			householdId: context.householdId,
			createdBy: context.actorId,
			visibility,
			displayName: deriveDisplayName(entry),
			firstName: orNull(entry.firstName),
			lastName: orNull(entry.lastName),
			nickname: orNull(entry.nickname),
			description: orNull(entry.description),
			howWeMet: null,
			metDate: null,
			metPlace: null,
			birthDate,
			birthDatePrecision: birthDate?.startsWith('--') ? 'month_day' : 'full',
			...stamps
		};
		contacts.push(contact);
		created.push({ ref: entry.ref, contact });
		report.push({ ref: entry.ref, id, displayName: contact.displayName, status: 'new' });
		entry.fields.forEach((field, position) => {
			fields.push({
				id: fieldIdFor(source, entry.ref, position),
				contactId: id,
				kind: field.kind,
				label: orNull(field.label),
				value: field.value.trim(),
				meta: null,
				sortOrder: position,
				...stamps
			});
		});
	});

	return { idByRef, contacts, fields, report, created };
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

		const endpoints = canonicalEndpoints(from, to, type.symmetric);
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
				parentEdges: graph.parentEdges,
				derivedSiblingIds:
					type.key === SIBLING_TYPE_KEY
						? deriveKinship(graph, from)
								.filter((kin) => kin.term === 'sibling')
								.map((kin) => kin.personId)
						: []
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

// ── Circles ───────────────────────────────────────────────────────────────

function planCircles(
	document: ApiImportDocument,
	context: ApiImportContext,
	personIdByRef: ReadonlyMap<string, string>,
	problems: ApiImportProblem[]
) {
	const { source } = document;
	const visibility = document.visibility ?? context.defaultVisibility;
	const stamps = { createdAt: context.now, updatedAt: context.now };
	const circleIdByRef = new Map<string, string>();
	const rows: PlannedCircle[] = [];
	const memberships: PlannedMembership[] = [];
	const report: ApiImportReport['circles'] = [];
	let alreadyThere = 0;

	document.circles.forEach((entry, index) => {
		const at = `circles[${index}]`;
		if (circleIdByRef.has(entry.ref)) {
			problems.push({ code: 'duplicateRef', path: `${at}.ref`, ref: entry.ref });
			return;
		}
		const id = isExistingCircle(entry) ? entry.existingId : circleIdFor(source, entry.ref);
		// A parent is named before the circles inside it — read before this circle's own ref is
		// known — which rules out a cycle, a circle inside itself included, and lets the rows be
		// written in document order without a parent's key dangling.
		const parentCircleId =
			isExistingCircle(entry) || entry.parent === null
				? null
				: (circleIdByRef.get(entry.parent) ?? null);
		circleIdByRef.set(entry.ref, id);
		const known = context.circles.get(id);

		if (isExistingCircle(entry)) {
			if (!known) {
				problems.push({ code: 'circleNotFound', path: `${at}.existingId`, id: entry.existingId });
				return;
			}
			report.push({ ref: entry.ref, id, name: known.name, status: 'existing' });
		} else if (context.hiddenIds.has(id)) {
			problems.push({ code: 'idTaken', path: `${at}.ref`, ref: entry.ref });
		} else if (known) {
			report.push({ ref: entry.ref, id, name: known.name, status: 'imported' });
		} else {
			report.push({ ref: entry.ref, id, name: entry.name.trim(), status: 'new' });
		}

		if (!isExistingCircle(entry)) {
			if (entry.parent !== null && parentCircleId === null) {
				problems.push({ code: 'unknownRef', path: `${at}.parent`, ref: entry.parent });
			}
			if (!known) {
				rows.push({
					id,
					householdId: context.householdId,
					createdBy: context.actorId,
					visibility,
					name: entry.name.trim(),
					description: orNull(entry.description),
					kind: resolveCircleKind(entry.kind),
					color: resolveCircleColor(null),
					parentCircleId,
					startDate: orNull(entry.startDate),
					endDate: orNull(entry.endDate),
					...stamps
				});
			}
		}

		const members = new Set(known?.memberIds ?? []);
		const named = new Set<string>();
		entry.members.forEach((member, position) => {
			const memberAt = `${at}.members[${position}]`;
			if (named.has(member.person)) {
				problems.push({ code: 'duplicateMember', path: memberAt, ref: member.person });
				return;
			}
			named.add(member.person);
			const contactId = personIdByRef.get(member.person);
			if (contactId === undefined) {
				problems.push({ code: 'unknownRef', path: `${memberAt}.person`, ref: member.person });
				return;
			}
			if (members.has(contactId)) {
				alreadyThere++;
				return;
			}
			memberships.push({
				id: membershipIdFor(source, entry.ref, member.person),
				circleId: id,
				contactId,
				role: orNull(member.role),
				startDate: orNull(member.startDate),
				endDate: orNull(member.endDate),
				createdBy: context.actorId,
				...stamps
			});
		});
	});

	return { rows, memberships, report, alreadyThere };
}
