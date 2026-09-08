import type {
	MonicaActivity,
	MonicaAddress,
	MonicaContact,
	MonicaContactField,
	MonicaContactFieldType,
	SourceExport,
	MonicaGender,
	MonicaGift,
	MonicaId,
	MonicaJournalEntry,
	MonicaLifeEvent,
	MonicaNote,
	MonicaPet,
	MonicaPhoto,
	MonicaRelationship,
	MonicaRelationshipType,
	MonicaSpecialDate
} from './monica-export';

/*
 * Monica's JSON export, read into the same `SourceExport` the SQL dump produces (docs/02
 * §2.16), so the mapping downstream never learns which file it came from.
 *
 * The shape follows Monica's own export resources (`app/ExportResources/*`): a record is
 * `{uuid, created_at, updated_at, properties: {...}, data: [...]}`, and its children arrive as
 * `{count, type, values}` buckets inside `data`. Two details of that format decide how this
 * reads: an **empty collection is omitted**, not sent as count 0 — so a bucket is found by its
 * `type` and never by position — and everything is keyed by **uuid**, which is why a Monica id
 * is a string here where the dump had a number.
 *
 * Where the dump has side tables, the JSON nests: a birthday is a special-date object inside
 * the person. Those are lifted back out, keeping the uuid Monica gave them, so the mapping
 * keeps looking records up the one way it always has.
 */

/** A file that is not a Monica JSON export, or is one this reader cannot take apart. */
export class MonicaJsonError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'MonicaJsonError';
	}
}

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

const obj = (v: unknown): Json => (isObject(v) ? v : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const props = (record: unknown): Json => obj(obj(record).properties);

const str = (v: unknown): string | null =>
	v === null || v === undefined || v === '' ? null : String(v);
const bool = (v: unknown): boolean => v === true || v === 1 || v === '1';
const num = (v: unknown): number | null =>
	v === null || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : null;

/** Monica writes timestamps; a Stella day is the first ten characters of one. */
const dayOf = (v: unknown): string | null => str(v)?.slice(0, 10) ?? null;

/** The uuid a record is keyed by; every exported record has one except the day-journal rows. */
function uuidOf(record: unknown, what: string): MonicaId {
	const id = str(obj(record).uuid);
	if (id === null) throw new MonicaJsonError(`A ${what} in this export has no uuid.`);
	return id;
}

/**
 * The records of one collection inside a `data` list. Looked up by `type` because Monica
 * leaves an empty collection out of the list rather than sending it empty — reading by
 * position would silently shift every collection after the first empty one.
 */
function bucket(container: unknown, type: string): unknown[] {
	const found = list(obj(container).data).find((entry) => obj(entry).type === type);
	return found === undefined ? [] : list(obj(found).values);
}

/** How many records a collection holds, without reading them. */
const bucketCount = (container: unknown, type: string): number => bucket(container, type).length;

/** The account object, or a refusal that says what the file is missing. */
function accountOf(parsed: unknown): Json {
	if (!isObject(parsed) || !isObject(parsed.account)) {
		throw new MonicaJsonError('This file is not a Monica JSON export.');
	}
	if (str(parsed.version) === null) {
		throw new MonicaJsonError(
			'This file has an account but no export version, so it is not one of Monica’s own exports.'
		);
	}
	return parsed.account;
}

/** A nested special date, lifted out under the uuid Monica already gave it. */
function specialDate(record: unknown, contactId: MonicaId): MonicaSpecialDate | null {
	if (!isObject(record)) return null;
	const date = dayOf(record.date);
	if (date === null) return null;
	return {
		id: uuidOf(record, 'date'),
		contactId,
		isAgeBased: bool(record.is_age_based),
		isYearUnknown: bool(record.is_year_unknown),
		date
	};
}

export function readMonicaJsonExport(parsed: unknown): SourceExport {
	const account = accountOf(parsed);
	const instance = obj(account.instance);
	const accountProps = obj(account.properties);

	const genders: MonicaGender[] = list(instance.genders).map((g) => ({
		id: uuidOf(g, 'gender'),
		type: str(props(g).type),
		name: str(props(g).name) ?? ''
	}));

	const contactFieldTypes: MonicaContactFieldType[] = list(instance.contact_field_types).map((t) => ({
		id: uuidOf(t, 'contact field type'),
		name: str(props(t).name) ?? '',
		type: str(props(t).type),
		protocol: str(props(t).protocol)
	}));

	// An activity names its type by uuid; the mapping wants Monica's translation key.
	const activityTypeKeys = new Map<MonicaId, string | null>(
		list(instance.activity_types).map((t) => [
			uuidOf(t, 'activity type'),
			str(props(t).translation_key)
		])
	);

	const contacts: MonicaContact[] = [];
	const specialDates: MonicaSpecialDate[] = [];
	const contactFields: MonicaContactField[] = [];
	const addresses: MonicaAddress[] = [];
	const notes: MonicaNote[] = [];
	const gifts: MonicaGift[] = [];
	const lifeEvents: MonicaLifeEvent[] = [];
	const pets: MonicaPet[] = [];
	// Tags are names on a person, not records of their own, so the name is the key.
	const tagContacts = new Map<string, MonicaId[]>();
	// Which person claims an activity or a photo; the link lives on the person's side.
	const activityContacts = new Map<MonicaId, MonicaId[]>();
	const photoContact = new Map<MonicaId, MonicaId>();

	for (const record of bucket(account, 'contact')) {
		const id = uuidOf(record, 'contact');
		const p = props(record);
		const avatar = obj(p.avatar);

		const dates = {
			birthdaySpecialDateId: specialDate(p.birthdate, id),
			deceasedSpecialDateId: specialDate(p.deceased_date, id),
			firstMetSpecialDateId: specialDate(p.first_met_date, id)
		};
		for (const date of Object.values(dates)) if (date) specialDates.push(date);

		contacts.push({
			id,
			firstName: str(p.first_name),
			middleName: str(p.middle_name),
			lastName: str(p.last_name),
			nickname: str(p.nickname),
			genderId: str(p.gender),
			description: str(p.description),
			isPartial: bool(p.is_partial),
			isDead: bool(p.is_dead),
			deceasedSpecialDateId: dates.deceasedSpecialDateId?.id ?? null,
			birthdaySpecialDateId: dates.birthdaySpecialDateId?.id ?? null,
			firstMetSpecialDateId: dates.firstMetSpecialDateId?.id ?? null,
			firstMetThroughContactId: str(p.first_met_through),
			// Monica's export resource carries neither of these, so they are gone from a JSON
			// export the way they were never written. `plan.ts` reports the loss.
			firstMetWhere: null,
			firstMetAdditionalInfo: null,
			job: str(p.job),
			company: str(p.company),
			avatarSource: str(avatar.avatar_source),
			avatarPhotoId: str(avatar.avatar_photo),
			// The export writes live records only; a person deleted in Monica is not in the file.
			deletedAt: null,
			createdAt: str(obj(record).created_at)
		});

		for (const name of list(p.tags)) {
			const tag = str(name);
			if (tag === null) continue;
			tagContacts.set(tag, [...(tagContacts.get(tag) ?? []), id]);
		}

		for (const field of bucket(record, 'contact_field')) {
			contactFields.push({
				id: uuidOf(field, 'contact field'),
				contactId: id,
				typeId: str(props(field).type) ?? '',
				data: str(props(field).data) ?? '',
				createdAt: str(obj(field).created_at)
			});
		}

		for (const address of bucket(record, 'address')) {
			const a = props(address);
			addresses.push({
				id: uuidOf(address, 'address'),
				contactId: id,
				name: str(a.name),
				street: str(a.street),
				city: str(a.city),
				province: str(a.province),
				postalCode: str(a.postal_code),
				country: str(a.country)
			});
		}

		for (const note of bucket(record, 'note')) {
			notes.push({
				id: uuidOf(note, 'note'),
				contactId: id,
				body: str(props(note).body) ?? '',
				isFavorited: bool(props(note).is_favorite),
				createdAt: str(obj(note).created_at)
			});
		}

		for (const gift of bucket(record, 'gift')) {
			const g = props(gift);
			gifts.push({
				id: uuidOf(gift, 'gift'),
				contactId: id,
				name: str(g.name) ?? '',
				comment: str(g.comment),
				url: str(g.url),
				status: str(g.status),
				date: dayOf(g.date)
			});
		}

		for (const event of bucket(record, 'life_event')) {
			const e = props(event);
			lifeEvents.push({
				id: uuidOf(event, 'life event'),
				contactId: id,
				name: str(e.name),
				note: str(e.note),
				typeKey: str(e.life_event_type),
				happenedAt: dayOf(e.happened_at)
			});
		}

		for (const pet of bucket(record, 'pet')) {
			pets.push({
				id: uuidOf(pet, 'pet'),
				contactId: id,
				name: str(props(pet).name),
				category: str(props(pet).pet_category)
			});
		}

		// These two buckets carry bare uuids rather than records: the record itself sits at
		// account level, and only the link lives here.
		for (const activity of bucket(record, 'activity')) {
			const key = str(activity);
			if (key === null) continue;
			activityContacts.set(key, [...(activityContacts.get(key) ?? []), id]);
		}
		for (const photo of bucket(record, 'photo')) {
			const key = str(photo);
			if (key !== null && !photoContact.has(key)) photoContact.set(key, id);
		}
	}

	const activities: MonicaActivity[] = bucket(account, 'activity').map((a) => {
		const id = uuidOf(a, 'activity');
		const p = props(a);
		return {
			id,
			summary: str(p.summary),
			description: str(p.description),
			happenedAt: dayOf(p.happened_at) ?? '',
			typeKey: activityTypeKeys.get(str(p.type) ?? '') ?? null,
			contactIds: activityContacts.get(id) ?? [],
			createdAt: str(obj(a).created_at)
		};
	});

	const photos: MonicaPhoto[] = bucket(account, 'photo').map((p) => {
		const id = uuidOf(p, 'photo');
		const properties = props(p);
		return {
			id,
			// The JSON export carries the image itself; the "path" is only what it was called.
			path: str(properties.original_filename) ?? String(id),
			dataUrl: str(properties.dataUrl),
			mime: str(properties.mime_type) ?? 'image/jpeg',
			sizeBytes: num(properties.filesize),
			contactId: photoContact.get(id) ?? null,
			createdAt: str(obj(p).created_at)
		};
	});

	// The export has no relationship-type table: a link names its type in words. One type per
	// distinct name, keyed by the name, which is also what the mapping matches against.
	const relationshipTypes: MonicaRelationshipType[] = [];
	const seenTypes = new Set<string>();
	const relationships: MonicaRelationship[] = [];
	for (const r of bucket(account, 'relationship')) {
		const p = props(r);
		const name = str(p.type) ?? '';
		if (!seenTypes.has(name)) {
			seenTypes.add(name);
			// Monica knows the reverse wording, but does not export it; the mapping only reads
			// the forward name, and a reverse it never sees is better than one invented here.
			relationshipTypes.push({ id: name, name, nameReverse: name });
		}
		relationships.push({
			id: uuidOf(r, 'relationship'),
			typeId: name,
			contactIs: str(p.contact_is) ?? '',
			ofContact: str(p.of_contact) ?? '',
			createdAt: str(obj(r).created_at)
		});
	}

	// A journal row is either a written entry or a rated day; only the first is writing.
	const journalEntries: MonicaJournalEntry[] = list(accountProps.journal_entries)
		.filter((entry) => str(props(entry).type) === 'entry')
		.map((entry) => ({
			id: uuidOf(entry, 'journal entry'),
			title: str(props(entry).title),
			post: str(props(entry).post) ?? '',
			createdAt: str(obj(entry).created_at)
		}));

	const tags = [...tagContacts].map(([name, contactIds]) => ({ id: name, name, contactIds }));

	return {
		source: 'json',
		contacts,
		genders,
		specialDates,
		relationshipTypes,
		relationships,
		contactFieldTypes,
		contactFields,
		addresses,
		notes,
		activities,
		tags,
		photos,
		gifts,
		lifeEvents,
		pets,
		journalEntries,
		userCount: bucketCount(account, 'user'),
		// Monica derives birthday and first-met reminders itself; the JSON export lists them
		// per person, and Stella derives its own, so they are counted and never imported.
		derivedReminderCount: bucket(account, 'contact').reduce(
			(total: number, record) => total + bucketCount(record, 'reminder'),
			0
		)
	};
}
