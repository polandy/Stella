import { SqlDumpError, type SqlDump, type SqlRow, type SqlValue } from './sql-dump';

/*
 * A typed view over the Monica tables the migration reads (docs/02 §2.16). Nothing is
 * interpreted here — that is the plan's job — this only names columns and narrows types so
 * the mapping reads like the documented table rather than like SQL rows.
 */

export interface MonicaContact {
	id: number;
	firstName: string | null;
	middleName: string | null;
	lastName: string | null;
	nickname: string | null;
	genderId: number | null;
	description: string | null;
	isPartial: boolean;
	isDead: boolean;
	deceasedSpecialDateId: number | null;
	birthdaySpecialDateId: number | null;
	firstMetSpecialDateId: number | null;
	firstMetThroughContactId: number | null;
	firstMetWhere: string | null;
	firstMetAdditionalInfo: string | null;
	job: string | null;
	company: string | null;
	avatarSource: string | null;
	avatarPhotoId: number | null;
	deletedAt: string | null;
	createdAt: string | null;
}

export interface MonicaGender {
	id: number;
	/** Monica's own type code: `M`, `F` or `O`. */
	type: string | null;
	name: string;
}

export interface MonicaSpecialDate {
	id: number;
	contactId: number;
	isAgeBased: boolean;
	isYearUnknown: boolean;
	/** ISO `YYYY-MM-DD`. */
	date: string;
}

export interface MonicaRelationshipType {
	id: number;
	name: string;
	nameReverse: string;
}

export interface MonicaRelationship {
	id: number;
	typeId: number;
	/** "contact_is <type> of_contact" — e.g. contact_is is the *parent* of of_contact. */
	contactIs: number;
	ofContact: number;
	createdAt: string | null;
}

export interface MonicaContactFieldType {
	id: number;
	name: string;
	/** Monica's builtin classification (`email`, `phone`) or null for user-defined types. */
	type: string | null;
	protocol: string | null;
}

export interface MonicaContactField {
	id: number;
	contactId: number;
	typeId: number;
	data: string;
	createdAt: string | null;
}

export interface MonicaAddress {
	id: number;
	contactId: number;
	name: string | null;
	street: string | null;
	city: string | null;
	province: string | null;
	postalCode: string | null;
	country: string | null;
}

export interface MonicaNote {
	id: number;
	contactId: number;
	body: string;
	isFavorited: boolean;
	createdAt: string | null;
}

export interface MonicaActivity {
	id: number;
	summary: string | null;
	description: string | null;
	/** ISO `YYYY-MM-DD`. */
	happenedAt: string;
	typeKey: string | null;
	/** Contacts linked to the activity, in link order. */
	contactIds: number[];
	createdAt: string | null;
}

export interface MonicaTag {
	id: number;
	name: string;
	contactIds: number[];
}

export interface MonicaPhoto {
	id: number;
	/** Path relative to Monica's public storage, e.g. `photos/abc.jpg`. */
	path: string;
	mime: string;
	sizeBytes: number | null;
	contactId: number | null;
	createdAt: string | null;
}

export interface MonicaGift {
	id: number;
	contactId: number;
	name: string;
	comment: string | null;
	url: string | null;
	status: string | null;
	date: string | null;
}

export interface MonicaLifeEvent {
	id: number;
	contactId: number;
	name: string | null;
	note: string | null;
	typeKey: string | null;
	happenedAt: string | null;
}

export interface MonicaPet {
	id: number;
	contactId: number;
	name: string | null;
	category: string | null;
}

export interface MonicaJournalEntry {
	id: number;
	title: string | null;
	post: string;
	createdAt: string | null;
}

export interface MonicaExport {
	contacts: MonicaContact[];
	genders: MonicaGender[];
	specialDates: MonicaSpecialDate[];
	relationshipTypes: MonicaRelationshipType[];
	relationships: MonicaRelationship[];
	contactFieldTypes: MonicaContactFieldType[];
	contactFields: MonicaContactField[];
	addresses: MonicaAddress[];
	notes: MonicaNote[];
	activities: MonicaActivity[];
	tags: MonicaTag[];
	photos: MonicaPhoto[];
	gifts: MonicaGift[];
	lifeEvents: MonicaLifeEvent[];
	pets: MonicaPet[];
	/** Free-standing journal entries (not attached to a person). */
	journalEntries: MonicaJournalEntry[];
	/** Number of Monica user accounts; the import attributes everything to one member. */
	userCount: number;
	/** Birthday/death/first-met reminders Monica derives itself; counted, never imported. */
	derivedReminderCount: number;
}

const str = (v: SqlValue | undefined): string | null =>
	v === null || v === undefined ? null : String(v);
const num = (v: SqlValue | undefined): number | null =>
	v === null || v === undefined ? null : Number(v);
const bool = (v: SqlValue | undefined): boolean => Number(v) === 1;
const need = (row: SqlRow, col: string, table: string): SqlValue => {
	const v = row[col];
	if (v === undefined) throw new SqlDumpError(`Table ${table} has no column ${col}.`);
	return v;
};
const dayOf = (v: SqlValue | undefined): string | null => {
	const s = str(v);
	return s ? s.slice(0, 10) : null;
};

/** Rows of an optional table — Monica versions differ in which tables exist. */
function optional(dump: SqlDump, table: string): SqlRow[] {
	return dump.hasTable(table) ? dump.rows(table) : [];
}

/** Read a parsed Monica dump into the typed export. Throws `SqlDumpError` if it is not one. */
export function readMonicaExport(dump: SqlDump): MonicaExport {
	for (const t of ['contacts', 'relationships', 'relationship_types']) {
		if (!dump.hasTable(t)) {
			throw new SqlDumpError(`This dump has no ${t} table — is it really a Monica database?`);
		}
	}

	const activityContacts = new Map<number, number[]>();
	for (const r of optional(dump, 'activity_contact')) {
		const list = activityContacts.get(Number(r.activity_id)) ?? [];
		list.push(Number(r.contact_id));
		activityContacts.set(Number(r.activity_id), list);
	}
	const activityTypes = new Map(
		optional(dump, 'activity_types').map((r) => [Number(r.id), str(r.translation_key)])
	);
	const tagContacts = new Map<number, number[]>();
	for (const r of optional(dump, 'contact_tag')) {
		const list = tagContacts.get(Number(r.tag_id)) ?? [];
		list.push(Number(r.contact_id));
		tagContacts.set(Number(r.tag_id), list);
	}
	const photoContact = new Map<number, number>();
	for (const r of optional(dump, 'contact_photo')) {
		photoContact.set(Number(r.photo_id), Number(r.contact_id));
	}
	const places = new Map(optional(dump, 'places').map((r) => [Number(r.id), r]));
	const lifeEventTypes = new Map(
		optional(dump, 'life_event_types').map((r) => [Number(r.id), str(r.default_life_event_type_key)])
	);
	const petCategories = new Map(
		optional(dump, 'pet_categories').map((r) => [Number(r.id), str(r.name)])
	);

	const contacts = dump.rows('contacts').map(
		(r): MonicaContact => ({
			id: Number(need(r, 'id', 'contacts')),
			firstName: str(r.first_name),
			middleName: str(r.middle_name),
			lastName: str(r.last_name),
			nickname: str(r.nickname),
			genderId: num(r.gender_id),
			description: str(r.description),
			isPartial: bool(r.is_partial),
			isDead: bool(r.is_dead),
			deceasedSpecialDateId: num(r.deceased_special_date_id),
			birthdaySpecialDateId: num(r.birthday_special_date_id),
			firstMetSpecialDateId: num(r.first_met_special_date_id),
			firstMetThroughContactId: num(r.first_met_through_contact_id),
			firstMetWhere: str(r.first_met_where),
			firstMetAdditionalInfo: str(r.first_met_additional_info),
			job: str(r.job),
			company: str(r.company),
			avatarSource: str(r.avatar_source),
			avatarPhotoId: num(r.avatar_photo_id),
			deletedAt: str(r.deleted_at),
			createdAt: str(r.created_at)
		})
	);

	const derivedReminderIds = new Set<number>();
	for (const r of dump.rows('contacts')) {
		for (const col of ['birthday_reminder_id', 'deceased_reminder_id', 'first_met_reminder_id']) {
			const id = num(r[col]);
			if (id !== null) derivedReminderIds.add(id);
		}
	}

	return {
		contacts,
		genders: optional(dump, 'genders').map((r) => ({
			id: Number(r.id),
			type: str(r.type),
			name: String(r.name ?? '')
		})),
		specialDates: optional(dump, 'special_dates').map((r) => ({
			id: Number(r.id),
			contactId: Number(r.contact_id),
			isAgeBased: bool(r.is_age_based),
			isYearUnknown: bool(r.is_year_unknown),
			date: dayOf(r.date) ?? ''
		})),
		relationshipTypes: dump.rows('relationship_types').map((r) => ({
			id: Number(r.id),
			name: String(r.name ?? ''),
			nameReverse: String(r.name_reverse_relationship ?? r.name ?? '')
		})),
		relationships: dump.rows('relationships').map((r) => ({
			id: Number(r.id),
			typeId: Number(need(r, 'relationship_type_id', 'relationships')),
			contactIs: Number(need(r, 'contact_is', 'relationships')),
			ofContact: Number(need(r, 'of_contact', 'relationships')),
			createdAt: str(r.created_at)
		})),
		contactFieldTypes: optional(dump, 'contact_field_types').map((r) => ({
			id: Number(r.id),
			name: String(r.name ?? ''),
			type: str(r.type),
			protocol: str(r.protocol)
		})),
		contactFields: optional(dump, 'contact_fields').map((r) => ({
			id: Number(r.id),
			contactId: Number(r.contact_id),
			typeId: Number(r.contact_field_type_id),
			data: String(r.data ?? ''),
			createdAt: str(r.created_at)
		})),
		addresses: optional(dump, 'addresses').map((r) => {
			const place = places.get(Number(r.place_id));
			return {
				id: Number(r.id),
				contactId: Number(r.contact_id),
				name: str(r.name),
				street: str(place?.street),
				city: str(place?.city),
				province: str(place?.province),
				postalCode: str(place?.postal_code),
				country: str(place?.country)
			};
		}),
		notes: optional(dump, 'notes').map((r) => ({
			id: Number(r.id),
			contactId: Number(r.contact_id),
			body: String(r.body ?? ''),
			isFavorited: bool(r.is_favorited),
			createdAt: str(r.created_at)
		})),
		activities: optional(dump, 'activities').map((r) => ({
			id: Number(r.id),
			summary: str(r.summary),
			description: str(r.description),
			happenedAt: dayOf(r.happened_at) ?? '',
			typeKey: r.activity_type_id === null ? null : (activityTypes.get(Number(r.activity_type_id)) ?? null),
			contactIds: activityContacts.get(Number(r.id)) ?? [],
			createdAt: str(r.created_at)
		})),
		tags: optional(dump, 'tags').map((r) => ({
			id: Number(r.id),
			name: String(r.name ?? ''),
			contactIds: tagContacts.get(Number(r.id)) ?? []
		})),
		photos: optional(dump, 'photos').map((r) => ({
			id: Number(r.id),
			path: String(r.new_filename ?? ''),
			mime: String(r.mime_type ?? 'application/octet-stream'),
			sizeBytes: num(r.filesize),
			contactId: photoContact.get(Number(r.id)) ?? null,
			createdAt: str(r.created_at)
		})),
		gifts: optional(dump, 'gifts').map((r) => ({
			id: Number(r.id),
			contactId: Number(r.contact_id),
			name: String(r.name ?? ''),
			comment: str(r.comment),
			url: str(r.url),
			status: str(r.status),
			date: dayOf(r.date)
		})),
		lifeEvents: optional(dump, 'life_events').map((r) => ({
			id: Number(r.id),
			contactId: Number(r.contact_id),
			name: str(r.name),
			note: str(r.note),
			typeKey: lifeEventTypes.get(Number(r.life_event_type_id)) ?? null,
			happenedAt: dayOf(r.happened_at)
		})),
		pets: optional(dump, 'pets').map((r) => ({
			id: Number(r.id),
			contactId: Number(r.contact_id),
			name: str(r.name),
			category: petCategories.get(Number(r.pet_category_id)) ?? null
		})),
		journalEntries: optional(dump, 'entries').map((r) => ({
			id: Number(r.id),
			title: str(r.title),
			post: String(r.post ?? ''),
			createdAt: str(r.created_at)
		})),
		userCount: optional(dump, 'users').length,
		derivedReminderCount: optional(dump, 'reminders').filter((r) =>
			derivedReminderIds.has(Number(r.id))
		).length
	};
}
