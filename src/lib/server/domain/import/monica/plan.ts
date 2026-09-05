import { dayLabel } from '../../../../dates/labels';
import type { Visibility } from '../../../access/visibility';
import type { NewContactField } from '../../contact-fields/contact-fields';
import type { BirthDatePrecision, NewContact } from '../../contacts/contacts';
import { deriveDisplayName } from '../../contacts/display-name';
import type { NewInteraction } from '../../interactions/interactions';
import type { NewNote } from '../../notes/notes';
import type { RelationshipCategory, NewRelationship } from '../../relationships/relationships';
import { BUILT_IN_RELATIONSHIP_TYPES } from '../../relationships/built-in-types';
import { canonicalEndpoints } from '../../relationships/relationships';
import { resolveTagColor, type NewTag } from '../../tags/tags';
import type { MonicaContact, MonicaExport, MonicaSpecialDate } from './monica-export';
import { mapRelationshipType } from './relationship-types';

/*
 * The Monica → Stella mapping (docs/02 §2.16; the table is docs/monica-mapping.md). Pure:
 * given the typed export it decides every row the import will write and reports what it
 * approximated or left out. Ids are stable *source ids* (`monica:contact:12`), so importing
 * the same dump twice cannot duplicate — the adapter inserts with "do nothing on conflict".
 */

export interface ImportOptions {
	householdId: string;
	userId: string;
	/** Visibility every imported record gets (the wizard's choice). */
	visibility: Visibility;
	/** Import time, stamped as createdAt/updatedAt on every row. */
	now: number;
}

/** A contact row as the import writes it — the profile fields Stella's create form lacks included. */
export interface ImportedContact extends NewContact {
	gender: string | null;
	jobTitle: string | null;
	company: string | null;
	isDeceased: boolean;
	deathDate: string | null;
}

/** A custom relationship type the import creates because Stella has no built-in equivalent. */
export interface ImportedRelationshipType {
	id: string;
	householdId: string;
	key: string;
	forwardLabel: string;
	reverseLabel: string;
	category: RelationshipCategory;
	symmetric: boolean;
}

/** A photo to copy from Monica's storage into Stella's media store. */
export interface ImportedPhoto {
	id: string;
	contactId: string;
	/** Relative to Monica's public storage directory (`storage/app/public`). */
	sourcePath: string;
	mime: string;
	sizeBytes: number | null;
	/** Whether the contact used this photo as their avatar. */
	isAvatar: boolean;
}

export interface ImportCounts {
	contacts: number;
	relationships: number;
	relationshipTypes: number;
	contactFields: number;
	notes: number;
	interactions: number;
	tags: number;
	photos: number;
}

export interface SkippedRecords {
	what: string;
	count: number;
	why: string;
}

export interface ImportReport {
	counts: ImportCounts;
	warnings: string[];
	skipped: SkippedRecords[];
}

export interface ImportPlan {
	contacts: ImportedContact[];
	contactFields: NewContactField[];
	relationshipTypes: ImportedRelationshipType[];
	relationships: NewRelationship[];
	notes: NewNote[];
	interactions: NewInteraction[];
	tags: NewTag[];
	contactTags: { contactId: string; tagId: string }[];
	photos: ImportedPhoto[];
	report: ImportReport;
}

const contactId = (monicaId: number) => `monica:contact:${monicaId}`;

const orNull = (value: string | null | undefined): string | null => {
	const trimmed = (value ?? '').trim();
	return trimmed.length > 0 ? trimmed : null;
};

/** Monica's gender codes → Stella's free-text gender. "Prefer not to say" stays empty. */
const GENDER: Record<string, string> = { M: 'male', F: 'female' };

/** A Monica special date → Stella's stored value plus precision (docs/03 §3.4). */
function birthDateOf(date: MonicaSpecialDate | undefined): {
	birthDate: string | null;
	birthDatePrecision: BirthDatePrecision;
} {
	if (!date) return { birthDate: null, birthDatePrecision: 'full' };
	if (date.isAgeBased) return { birthDate: date.date.slice(0, 4), birthDatePrecision: 'age' };
	if (date.isYearUnknown) return { birthDate: `--${date.date.slice(5)}`, birthDatePrecision: 'month_day' };
	return { birthDate: date.date, birthDatePrecision: 'full' };
}

function howWeMetOf(c: MonicaContact, nameOf: (id: number) => string | null): string | null {
	const info = orNull(c.firstMetAdditionalInfo);
	const through = c.firstMetThroughContactId === null ? null : nameOf(c.firstMetThroughContactId);
	if (info && through) return `${info} (through ${through})`;
	if (through) return `Through ${through}`;
	return info;
}

/** Humanise Monica's snake_case activity/life-event keys: `ate_restaurant` → "ate restaurant". */
const humanise = (key: string) => key.replace(/_/g, ' ');

/** Plan the import of a Monica export. Pure; see the module comment. */
export function planMonicaImport(exp: MonicaExport, opts: ImportOptions): ImportPlan {
	const warnings: string[] = [];
	const skipped: SkippedRecords[] = [];
	const skip = (what: string, why: string, count = 1) => {
		const existing = skipped.find((s) => s.what === what && s.why === why);
		if (existing) existing.count += count;
		else skipped.push({ what, count, why });
	};
	const stamp = { createdBy: opts.userId, visibility: opts.visibility, createdAt: opts.now, updatedAt: opts.now };

	// ── Contacts ────────────────────────────────────────────────────────────
	const live = exp.contacts.filter((c) => c.deletedAt === null);
	const deleted = exp.contacts.length - live.length;
	if (deleted > 0) skip('contact', 'deleted in Monica', deleted);
	const liveIds = new Set(live.map((c) => c.id));
	const specialDates = new Map(exp.specialDates.map((d) => [d.id, d]));
	const genders = new Map(exp.genders.map((g) => [g.id, g.type]));
	const nameOf = (id: number): string | null => {
		const c = exp.contacts.find((x) => x.id === id);
		return c ? deriveDisplayName({ firstName: c.firstName, lastName: c.lastName, nickname: c.nickname }) : null;
	};

	const contacts = live.map((c): ImportedContact => {
		const firstName = orNull([c.firstName, c.middleName].filter(Boolean).join(' '));
		const lastName = orNull(c.lastName);
		const nickname = orNull(c.nickname);
		const birthday = birthDateOf(
			c.birthdaySpecialDateId === null ? undefined : specialDates.get(c.birthdaySpecialDateId)
		);
		const death = c.deceasedSpecialDateId === null ? undefined : specialDates.get(c.deceasedSpecialDateId);
		const met = c.firstMetSpecialDateId === null ? undefined : specialDates.get(c.firstMetSpecialDateId);
		const genderType = c.genderId === null ? null : (genders.get(c.genderId) ?? null);
		return {
			id: contactId(c.id),
			householdId: opts.householdId,
			...stamp,
			displayName: deriveDisplayName({ firstName, lastName, nickname }),
			firstName,
			lastName,
			nickname,
			description: orNull(c.description),
			howWeMet: howWeMetOf(c, nameOf),
			metDate: met?.date ?? null,
			metPlace: orNull(c.firstMetWhere),
			...birthday,
			gender: genderType === null ? null : (GENDER[genderType] ?? null),
			jobTitle: orNull(c.job),
			company: orNull(c.company),
			isDeceased: c.isDead,
			deathDate: death?.date ?? null
		};
	});

	// ── Relationships ───────────────────────────────────────────────────────
	const typeNames = new Map(exp.relationshipTypes.map((t) => [t.id, t.name]));
	const customTypes = new Map<string, ImportedRelationshipType>();
	const seenRelationships = new Set<string>();
	const relationships: NewRelationship[] = [];
	const unknownTypeNames = new Set<string>();
	for (const r of exp.relationships) {
		if (!liveIds.has(r.contactIs) || !liveIds.has(r.ofContact)) {
			skip('relationship', 'refers to a deleted contact');
			continue;
		}
		const name = typeNames.get(r.typeId) ?? `type ${r.typeId}`;
		const mapped = mapRelationshipType(name);
		let typeId = mapped.key;
		if (mapped.custom) {
			typeId = `monica:reltype:${mapped.key}`;
			if (!customTypes.has(typeId)) {
				customTypes.set(typeId, {
					id: typeId,
					householdId: opts.householdId,
					key: mapped.key,
					...mapped.custom
				});
				if (mapped.custom.category === 'other') unknownTypeNames.add(name);
			}
		}
		const symmetric = mapped.custom?.symmetric ?? isBuiltInSymmetric(mapped.key);
		const [a, b] = mapped.forward ? [r.contactIs, r.ofContact] : [r.ofContact, r.contactIs];
		const ends = canonicalEndpoints(contactId(a), contactId(b), symmetric);
		const dedupeKey = `${typeId}|${ends.fromContactId}|${ends.toContactId}`;
		if (seenRelationships.has(dedupeKey)) continue;
		seenRelationships.add(dedupeKey);
		relationships.push({
			id: `monica:relationship:${r.id}`,
			householdId: opts.householdId,
			...ends,
			typeId,
			description: null,
			createdBy: opts.userId,
			createdAt: opts.now,
			updatedAt: opts.now
		});
	}
	for (const name of unknownTypeNames) {
		warnings.push(`Relationship type "${name}" has no Stella equivalent; created as a custom type.`);
	}

	// ── Contact fields ──────────────────────────────────────────────────────
	const fieldTypes = new Map(exp.contactFieldTypes.map((t) => [t.id, t]));
	const contactFields: NewContactField[] = [];
	let sortOrder = 0;
	const fieldStamp = { createdAt: opts.now, updatedAt: opts.now, meta: null };
	for (const f of exp.contactFields) {
		if (!liveIds.has(f.contactId)) {
			skip('contact field', 'belongs to a deleted contact');
			continue;
		}
		const type = fieldTypes.get(f.typeId);
		const base = { id: `monica:field:${f.id}`, contactId: contactId(f.contactId), sortOrder: sortOrder++, ...fieldStamp };
		if (type?.type === 'email') contactFields.push({ ...base, kind: 'email', label: null, value: f.data });
		else if (type?.type === 'phone') contactFields.push({ ...base, kind: 'phone', label: null, value: f.data });
		else if (type?.protocol?.startsWith('http')) {
			contactFields.push({ ...base, kind: 'url', label: type.name, value: `${type.protocol}${f.data}` });
		} else contactFields.push({ ...base, kind: 'custom', label: type?.name ?? null, value: f.data });
	}
	for (const a of exp.addresses) {
		if (!liveIds.has(a.contactId)) {
			skip('address', 'belongs to a deleted contact');
			continue;
		}
		const cityLine = orNull([a.postalCode, a.city].filter(Boolean).join(' '));
		const value = [a.street, cityLine, a.province, a.country].map(orNull).filter(Boolean).join(', ');
		if (!value) {
			skip('address', 'empty');
			continue;
		}
		contactFields.push({
			id: `monica:address:${a.id}`,
			contactId: contactId(a.contactId),
			kind: 'address',
			label: orNull(a.name),
			value,
			sortOrder: sortOrder++,
			...fieldStamp
		});
	}

	// ── Notes, plus the Monica modules Stella has no home for ───────────────
	const notes: NewNote[] = [];
	const noteFor = (id: string, monicaContactId: number, title: string | null, body: string, isPinned = false, what = 'note') => {
		if (!liveIds.has(monicaContactId)) {
			skip(what, 'belongs to a deleted contact');
			return;
		}
		notes.push({ id, contactId: contactId(monicaContactId), ...stamp, title, body, isPinned });
	};
	for (const n of exp.notes) noteFor(`monica:note:${n.id}`, n.contactId, null, n.body, n.isFavorited);
	for (const g of exp.gifts) {
		const meta = [g.status, g.date ? dayLabel(g.date) : null].filter(Boolean).join(', ');
		const lines = [`🎁 **${g.name}**${meta ? ` — ${meta}` : ''}`, orNull(g.comment), orNull(g.url)].filter(Boolean);
		noteFor(`monica:gift:${g.id}`, g.contactId, 'Gift', lines.join('\n\n'), false, 'gift');
	}
	for (const e of exp.lifeEvents) {
		const head = `📅 **${e.name ?? (e.typeKey ? humanise(e.typeKey) : 'Life event')}**${e.typeKey && e.name ? ` (${humanise(e.typeKey)})` : ''}`;
		const when = e.happenedAt ? ` — ${dayLabel(e.happenedAt)}` : '';
		noteFor(`monica:lifeevent:${e.id}`, e.contactId, 'Life event', [head + when, orNull(e.note)].filter(Boolean).join('\n\n'), false, 'life event');
	}
	for (const p of exp.pets) {
		noteFor(`monica:pet:${p.id}`, p.contactId, 'Pet', `🐾 **${p.name ?? 'Pet'}**${p.category ? `, ${p.category}` : ''}`, false, 'pet');
	}

	// ── Activities → interactions ───────────────────────────────────────────
	const interactions: NewInteraction[] = [];
	for (const a of exp.activities) {
		const people = a.contactIds.filter((id) => liveIds.has(id));
		if (people.length === 0) {
			skip('activity', a.contactIds.length === 0 ? 'linked to no person' : 'linked only to deleted contacts');
			continue;
		}
		const [subject, ...participants] = people;
		const description = [orNull(a.description), a.typeKey ? `(Monica activity: ${humanise(a.typeKey)})` : null]
			.filter(Boolean)
			.join('\n\n');
		interactions.push({
			id: `monica:activity:${a.id}`,
			contactId: contactId(subject!),
			...stamp,
			kind: 'met',
			happenedAt: a.happenedAt,
			title: orNull(a.summary),
			description: orNull(description),
			participantIds: participants.map(contactId)
		});
	}

	// ── Tags ────────────────────────────────────────────────────────────────
	const tags: NewTag[] = [];
	const contactTags: { contactId: string; tagId: string }[] = [];
	for (const t of exp.tags) {
		const tagId = `monica:tag:${t.id}`;
		tags.push({ id: tagId, householdId: opts.householdId, name: t.name, color: resolveTagColor(null), createdAt: opts.now, updatedAt: opts.now });
		for (const c of t.contactIds) {
			if (liveIds.has(c)) contactTags.push({ contactId: contactId(c), tagId });
		}
	}

	// ── Photos ──────────────────────────────────────────────────────────────
	const avatarOf = new Map(
		live.filter((c) => c.avatarSource === 'photo' && c.avatarPhotoId !== null).map((c) => [c.avatarPhotoId!, c.id])
	);
	const photos: ImportedPhoto[] = [];
	for (const p of exp.photos) {
		if (p.contactId === null) {
			skip('photo', 'attached to no person');
			continue;
		}
		if (!liveIds.has(p.contactId)) {
			skip('photo', 'belongs to a deleted contact');
			continue;
		}
		photos.push({
			id: `monica:photo:${p.id}`,
			contactId: contactId(p.contactId),
			sourcePath: p.path,
			mime: p.mime,
			sizeBytes: p.sizeBytes,
			isAvatar: avatarOf.get(p.id) === p.contactId
		});
	}

	// ── What has no place in Stella ─────────────────────────────────────────
	for (const j of exp.journalEntries) {
		skip('journal entry', `not attached to a person (${j.title ?? j.post.slice(0, 40)})`);
	}
	if (exp.derivedReminderCount > 0) {
		skip('reminder', 'Stella derives birthday reminders itself', exp.derivedReminderCount);
	}
	if (exp.userCount > 1) {
		warnings.push(`Monica had ${exp.userCount} user accounts; everything is attributed to the importing member.`);
	}

	const relationshipTypes = [...customTypes.values()];
	return {
		contacts,
		contactFields,
		relationshipTypes,
		relationships,
		notes,
		interactions,
		tags,
		contactTags,
		photos,
		report: {
			counts: {
				contacts: contacts.length,
				relationships: relationships.length,
				relationshipTypes: relationshipTypes.length,
				contactFields: contactFields.length,
				notes: notes.length,
				interactions: interactions.length,
				tags: tags.length,
				photos: photos.length
			},
			warnings,
			skipped
		}
	};
}


function isBuiltInSymmetric(key: string): boolean {
	const type = BUILT_IN_RELATIONSHIP_TYPES.find((t) => t.id === key);
	if (!type) throw new Error(`Relationship type mapping names unknown built-in type ${key}.`);
	return type.symmetric;
}
