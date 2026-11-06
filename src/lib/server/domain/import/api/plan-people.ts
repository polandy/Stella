import type { ContactFieldKind } from '../../../../people/contact-fields';
import type { NewContactField } from '../../contact-fields/contact-fields';
import type { NewContact } from '../../contacts/contacts';
import { partialDateOfDay } from '../../../../dates/partial-date';
import { deriveDisplayName } from '../../../../people/display-name';
import {
	fieldIdFor,
	isExistingPerson,
	personIdFor,
	type ApiContactField,
	type ApiImportDocument
} from './document';
import type {
	ApiImportContext,
	ApiImportProblem,
	ApiImportReport,
	KnownField,
	KnownPerson
} from './plan';
import { orNull } from './text';

/*
 * The people half of an API import plan (docs/02 §2.16.1): each entry either names someone
 * already in Stella, whose missing fields it completes, or is a new person, created once under
 * an id derived from the sender's ref. A new name that matches someone here is only reported.
 */

export function planPeople(
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

export function possibleDuplicates(
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
