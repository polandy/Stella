import type {
	MonicaAddress,
	MonicaContact,
	MonicaContactField,
	MonicaContactFieldType,
	SourceExport,
	MonicaGender,
	MonicaNote,
	MonicaPhoto,
	MonicaSpecialDate,
	MonicaTag
} from './monica/monica-export';
import {
	cardFingerprint,
	fingerprint,
	orNull,
	parseDay,
	readAddress,
	readName,
	readPhoto,
	splitCards,
	splitEscaped,
	unescape
} from './vcard-lines';
import { detectSource, ownCategories } from './vcard-source';

export { VCardError } from './vcard-lines';

/*
 * Reading a vCard into the importer's typed view (docs/02 §2.16). A vCard is the one accepted
 * source Monica did not write: contacts only — no relationships, no activities, no journal —
 * so it fills the same view sparsely and the mapping downstream is unchanged. The format
 * itself is read in `vcard-lines.ts`.
 */

/** The field types a vCard can produce; Monica's own numeric ids have no meaning here. */
const FIELD_TYPES: MonicaContactFieldType[] = [
	{ id: 'email', name: 'Email', type: 'email', protocol: null },
	{ id: 'phone', name: 'Phone', type: 'phone', protocol: null },
	{ id: 'url', name: 'Website', type: 'url', protocol: null }
];

/** vCard's three gender codes; the mapping turns them into Stella's free text. */
const GENDER_CODES = ['M', 'F', 'O'];

/**
 * What a source id may be made of. It ends up in `/contacts/<id>` and `/media/<id>`, so a UID
 * carrying a slash, a hash or a query mark is not usable as one — such a card is keyed by its
 * contents instead, exactly like a card with no UID at all.
 */
const URL_SAFE_ID = /^[A-Za-z0-9._~:@+-]+$/;

/** Read a vCard file into the typed view the mapping works on. Pure; see the module comment. */
export function readVCard(text: string): SourceExport {
	const contacts: MonicaContact[] = [];
	const specialDates: MonicaSpecialDate[] = [];
	const contactFields: MonicaContactField[] = [];
	const addresses: MonicaAddress[] = [];
	const notes: MonicaNote[] = [];
	const photos: MonicaPhoto[] = [];
	const genderCodes = new Set<string>();
	const tagContacts = new Map<string, string[]>();

	const cards = splitCards(text);
	const source = detectSource(cards);
	cards.forEach((card, index) => {
		const first = (name: string) => card.find((p) => p.name === name);
		const all = (name: string) => card.filter((p) => p.name === name);

		const uid = orNull(first('UID')?.raw)?.replace(/^urn:uuid:/i, '');
		// Without a usable UID the card must still get a *stable* id, and its position is not
		// one: two address books would then collide and the second one's people be dropped as
		// duplicates.
		const id = uid !== undefined && URL_SAFE_ID.test(uid) ? uid : `card-${cardFingerprint(card)}`;

		const { firstName, middleName, lastName } = readName(card, index);

		const birthday = first('BDAY') ? parseDay(unescape(first('BDAY')!.raw)) : null;
		let birthdaySpecialDateId: string | null = null;
		if (birthday) {
			birthdaySpecialDateId = `${id}~bday`;
			specialDates.push({
				id: birthdaySpecialDateId,
				contactId: id,
				isAgeBased: false,
				isYearUnknown: birthday.isYearUnknown,
				date: birthday.date
			});
		}

		let fieldIndex = 0;
		const addField = (typeId: string, data: string | null) => {
			if (data === null) return;
			contactFields.push({
				id: `${id}~${fieldIndex++}`,
				contactId: id,
				typeId,
				data,
				createdAt: null
			});
		};
		for (const p of all('EMAIL')) addField('email', orNull(unescape(p.raw)));
		for (const p of all('TEL')) addField('phone', orNull(unescape(p.raw)));
		for (const p of all('URL')) addField('url', orNull(unescape(p.raw)));

		let addressIndex = 0;
		for (const p of all('ADR')) {
			addresses.push({
				id: `${id}~adr${addressIndex++}`,
				contactId: id,
				name: orNull(p.params.get('TYPE')?.[0]),
				...readAddress(p)
			});
		}

		let noteIndex = 0;
		for (const p of all('NOTE')) {
			const body = orNull(unescape(p.raw));
			if (body)
				notes.push({
					id: `${id}~note${noteIndex++}`,
					contactId: id,
					body,
					isFavorited: false,
					createdAt: null
				});
		}

		for (const name of ownCategories(card, source)) {
			const members = tagContacts.get(name) ?? [];
			if (!members.includes(id)) members.push(id);
			tagContacts.set(name, members);
		}

		let avatarPhotoId: string | null = null;
		let photoIndex = 0;
		for (const p of all('PHOTO')) {
			const photo = readPhoto(p, `${id}~photo${photoIndex++}`, id);
			if (!photo) continue;
			photos.push(photo);
			avatarPhotoId ??= String(photo.id);
		}

		const genderCode =
			orNull(splitEscaped(first('GENDER')?.raw ?? '', ';')[0])?.toUpperCase() ?? null;
		const gender = genderCode !== null && GENDER_CODES.includes(genderCode) ? genderCode : null;
		if (gender) genderCodes.add(gender);

		const org = first('ORG') ? splitEscaped(first('ORG')!.raw, ';').map(unescape) : [];
		contacts.push({
			id,
			firstName,
			middleName,
			lastName,
			nickname: orNull(splitEscaped(first('NICKNAME')?.raw ?? '', ',').map(unescape)[0]),
			genderId: gender,
			description: null,
			isPartial: false,
			isDead: false,
			deceasedSpecialDateId: null,
			birthdaySpecialDateId,
			firstMetSpecialDateId: null,
			firstMetThroughContactId: null,
			firstMetWhere: null,
			firstMetAdditionalInfo: null,
			job: orNull(unescape(first('TITLE')?.raw ?? '')),
			company: orNull(org[0]),
			avatarSource: avatarPhotoId === null ? null : 'photo',
			avatarPhotoId,
			deletedAt: null,
			createdAt: null
		});
	});

	// A tag is its name, and the id has to say so: numbering them per file made the id mean
	// "the first tag in whichever file this was", which two address books cannot both be.
	const tags: MonicaTag[] = [...tagContacts.entries()].map(([name, contactIds]) => ({
		id: `tag-${fingerprint(name)}`,
		name,
		contactIds
	}));
	const genders: MonicaGender[] = [...genderCodes].map((code) => ({
		id: code,
		type: code,
		name: code
	}));

	return {
		source: 'vcard',
		contacts,
		genders,
		specialDates,
		relationshipTypes: [],
		relationships: [],
		contactFieldTypes: FIELD_TYPES,
		contactFields,
		addresses,
		notes,
		activities: [],
		tags,
		photos,
		gifts: [],
		tasks: [],
		lifeEvents: [],
		pets: [],
		journalEntries: [],
		userCount: 1,
		derivedReminderCount: 0
	};
}
