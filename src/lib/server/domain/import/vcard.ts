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

/*
 * Reading a vCard into the importer's typed view (docs/02 §2.16). A vCard is the one accepted
 * source Monica did not write: contacts only — no relationships, no activities, no journal —
 * so it fills the same view sparsely and the mapping downstream is unchanged.
 *
 * Hand-rolled rather than pulled from a package: the subset a contacts export uses is small
 * and stable (RFC 6350 for vCard 4.0, RFC 2426 for 3.0), and every published parser brings a
 * dependency far larger than the two dozen lines of unfolding and unescaping it saves.
 */

/** The file is not a vCard, or a card in it is broken. Carries a message meant for the admin. */
export class VCardError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'VCardError';
	}
}

/** The field types a vCard can produce; Monica's own numeric ids have no meaning here. */
const FIELD_TYPES: MonicaContactFieldType[] = [
	{ id: 'email', name: 'Email', type: 'email', protocol: null },
	{ id: 'phone', name: 'Phone', type: 'phone', protocol: null },
	{ id: 'url', name: 'Website', type: 'url', protocol: null }
];

/** vCard's three gender codes; the mapping turns them into Stella's free text. */
const GENDER_CODES = ['M', 'F', 'O'];

/** vCard 2.1's text encoding, named in an `ENCODING` parameter and folded with a trailing `=`. */
const QUOTED_PRINTABLE = /QUOTED-PRINTABLE/i;

/**
 * What a source id may be made of. It ends up in `/contacts/<id>` and `/media/<id>`, so a UID
 * carrying a slash, a hash or a query mark is not usable as one — such a card is keyed by its
 * contents instead, exactly like a card with no UID at all.
 */
const URL_SAFE_ID = /^[A-Za-z0-9._~:@+-]+$/;

const BEGIN = 'BEGIN:VCARD';
const END = 'END:VCARD';

interface Property {
	name: string;
	params: Map<string, string[]>;
	/** The raw value, still escaped — a structured property is split before it is unescaped. */
	raw: string;
}

/**
 * Fold continuation lines back into the line they belong to: a line starting with a space or
 * tab continues the one before it, with that one character dropped (RFC 6350 §3.2). vCard 2.1
 * folds a second way — a quoted-printable value breaks with a trailing `=` and continues on a
 * line of its own — so that is joined here too, before anything reads the value.
 */
function unfold(text: string): string[] {
	const lines: string[] = [];
	const last = () => lines[lines.length - 1] ?? '';
	for (const line of text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')) {
		if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
			lines[lines.length - 1] += line.slice(1);
		} else if (last().endsWith('=') && QUOTED_PRINTABLE.test(last())) {
			lines[lines.length - 1] = last().slice(0, -1) + line;
		} else if (line.length > 0) {
			lines.push(line);
		}
	}
	return lines;
}

/** Decode a vCard 2.1 quoted-printable value: `=C3=BC` is the UTF-8 for `ü`. */
function decodeQuotedPrintable(value: string): string {
	const bytes: number[] = [];
	for (let i = 0; i < value.length; i++) {
		const hex = value[i] === '=' ? value.slice(i + 1, i + 3) : null;
		if (hex !== null && /^[0-9a-f]{2}$/i.test(hex)) {
			bytes.push(parseInt(hex, 16));
			i += 2;
		} else {
			bytes.push(value.charCodeAt(i));
		}
	}
	return new TextDecoder().decode(Uint8Array.from(bytes));
}

/** Split on a separator the value may escape with a backslash. */
function splitEscaped(value: string, separator: string): string[] {
	const parts: string[] = [];
	let current = '';
	for (let i = 0; i < value.length; i++) {
		const char = value[i]!;
		if (char === '\\' && i + 1 < value.length) {
			current += char + value[i + 1];
			i++;
		} else if (char === separator) {
			parts.push(current);
			current = '';
		} else {
			current += char;
		}
	}
	parts.push(current);
	return parts;
}

/**
 * Split a property's name and parameters on `;`. Unlike a value's separators, one inside
 * double quotes is part of the parameter (RFC 6350 §3.3) — `TYPE="home;postal"` is one type.
 */
function splitParams(head: string): string[] {
	const parts: string[] = [];
	let current = '';
	let quoted = false;
	for (const char of head) {
		if (char === '"') quoted = !quoted;
		else if (char === ';' && !quoted) {
			parts.push(current);
			current = '';
			continue;
		}
		current += char;
	}
	parts.push(current);
	return parts;
}

/** Turn vCard's escapes back into the characters they stand for (RFC 6350 §3.4). */
function unescape(value: string): string {
	return value.replace(/\\([\\,;nN])/g, (_, char: string) =>
		char === 'n' || char === 'N' ? '\n' : char
	);
}

/** Parse one content line into name, parameters and the still-escaped value. */
function parseLine(line: string): Property | null {
	let colon = -1;
	let quoted = false;
	for (let i = 0; i < line.length; i++) {
		if (line[i] === '"') quoted = !quoted;
		else if (line[i] === ':' && !quoted) {
			colon = i;
			break;
		}
	}
	if (colon === -1) return null;

	const [head, ...paramParts] = splitParams(line.slice(0, colon));
	// A group prefix ("item1.EMAIL") only ties properties together for display; drop it.
	const name = head!.split('.').pop()!.trim().toUpperCase();
	const params = new Map<string, string[]>();
	for (const part of paramParts) {
		const eq = part.indexOf('=');
		const key = (eq === -1 ? part : part.slice(0, eq)).trim().toUpperCase();
		const rawValue = eq === -1 ? part : part.slice(eq + 1);
		params.set(
			key,
			rawValue
				.split(',')
				.map((v) => v.trim().replace(/^"|"$/g, ''))
				.filter((v) => v.length > 0)
		);
	}
	const value = line.slice(colon + 1);
	const encoding = params.get('ENCODING')?.[0] ?? '';
	return { name, params, raw: QUOTED_PRINTABLE.test(encoding) ? decodeQuotedPrintable(value) : value };
}

/** Split the file into cards, rejecting anything that is not one. */
function splitCards(text: string): Property[][] {
	const lines = unfold(text);
	const cards: Property[][] = [];
	let current: Property[] | null = null;
	for (const line of lines) {
		const upper = line.trim().toUpperCase();
		if (upper === BEGIN) {
			if (current) throw new VCardError('A card in this file begins before the one before it ended.');
			current = [];
			continue;
		}
		if (upper === END) {
			if (!current) throw new VCardError('This file ends a card that never began.');
			cards.push(current);
			current = null;
			continue;
		}
		if (!current) continue;
		const property = parseLine(line);
		if (property) current.push(property);
	}
	if (current) throw new VCardError('A card in this file was never closed with END:VCARD.');
	if (cards.length === 0) throw new VCardError('This file is not a vCard — it contains no BEGIN:VCARD.');
	return cards;
}

/**
 * A short, stable fingerprint of a card's contents. Two 32-bit FNV-1a rounds rather than a
 * digest: this has to be synchronous and dependency-free, and 64 bits is far more than an
 * address book needs to keep two people apart.
 */
function fingerprint(properties: Property[]): string {
	const text = properties.map((p) => `${p.name}:${p.raw}`).join('\n');
	const round = (seed: number) => {
		let hash = seed;
		for (let i = 0; i < text.length; i++) {
			hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
		}
		return (hash >>> 0).toString(16).padStart(8, '0');
	};
	return round(0x811c9dc5) + round(0x9dc5811c);
}

const orNull = (value: string | undefined): string | null => {
	const trimmed = (value ?? '').trim();
	return trimmed.length > 0 ? trimmed : null;
};

/** A vCard date, which may withhold the year (`--0407`). Null when it is free text. */
function parseDay(raw: string): { date: string; isYearUnknown: boolean } | null {
	const value = raw.trim().split('T')[0]!;
	const full = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(value);
	if (full) return { date: `${full[1]}-${full[2]}-${full[3]}`, isYearUnknown: false };
	const noYear = /^--(\d{2})-?(\d{2})$/.exec(value);
	if (noYear) return { date: `0000-${noYear[1]}-${noYear[2]}`, isYearUnknown: true };
	return null;
}

/** Bytes a base64 payload decodes to, without decoding it. */
function base64Size(payload: string): number {
	const clean = payload.replace(/\s/g, '');
	const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
	return Math.max(0, (clean.length / 4) * 3 - padding);
}

/** The picture a card carries, or null when it only points at one somewhere else. */
function readPhoto(property: Property, id: string, contactId: string): MonicaPhoto | null {
	const value = property.raw.trim();
	if (value.startsWith('data:')) {
		const mime = /^data:([^;,]+)/.exec(value)?.[1] ?? 'image/jpeg';
		const payload = value.slice(value.indexOf(',') + 1);
		return { id, path: `${id}.bin`, dataUrl: value, mime, sizeBytes: base64Size(payload), contactId, createdAt: null };
	}
	const encoding = property.params.get('ENCODING')?.[0]?.toLowerCase();
	if (encoding !== 'b' && encoding !== 'base64') return null; // a URI: the file is not in the card

	const declared = property.params.get('TYPE')?.[0]?.toLowerCase() ?? 'jpeg';
	const mime = declared.includes('/') ? declared : `image/${declared}`;
	return {
		id,
		path: `${id}.bin`,
		dataUrl: `data:${mime};base64,${value}`,
		mime,
		sizeBytes: base64Size(value),
		contactId,
		createdAt: null
	};
}

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

	splitCards(text).forEach((card, index) => {
		const first = (name: string) => card.find((p) => p.name === name);
		const all = (name: string) => card.filter((p) => p.name === name);

		const uid = orNull(first('UID')?.raw)?.replace(/^urn:uuid:/i, '');
		// Without a usable UID the card must still get a *stable* id, and its position is not
		// one: two address books would then collide and the second one's people be dropped as
		// duplicates.
		const id = uid !== undefined && uid !== null && URL_SAFE_ID.test(uid) ? uid : `card-${fingerprint(card)}`;

		const structured = first('N') ? splitEscaped(first('N')!.raw, ';').map(unescape) : [];
		const formatted = orNull(unescape(first('FN')?.raw ?? ''));
		const lastName = orNull(structured[0]);
		const firstName = orNull(structured[1]) ?? (lastName === null ? formatted : null);
		if (firstName === null && lastName === null) {
			throw new VCardError(`A card in this file names nobody — it has neither FN nor N (card ${index + 1}).`);
		}

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
			contactFields.push({ id: `${id}~${fieldIndex++}`, contactId: id, typeId, data, createdAt: null });
		};
		for (const p of all('EMAIL')) addField('email', orNull(unescape(p.raw)));
		for (const p of all('TEL')) addField('phone', orNull(unescape(p.raw)));
		for (const p of all('URL')) addField('url', orNull(unescape(p.raw)));

		let addressIndex = 0;
		for (const p of all('ADR')) {
			// RFC 6350 §6.3.1: po box; extended; street; locality; region; postal code; country.
			const parts = splitEscaped(p.raw, ';').map(unescape);
			addresses.push({
				id: `${id}~adr${addressIndex++}`,
				contactId: id,
				name: orNull(p.params.get('TYPE')?.[0]),
				street: orNull([parts[2], parts[1]].filter(Boolean).join(', ')),
				city: orNull(parts[3]),
				province: orNull(parts[4]),
				postalCode: orNull(parts[5]),
				country: orNull(parts[6])
			});
		}

		let noteIndex = 0;
		for (const p of all('NOTE')) {
			const body = orNull(unescape(p.raw));
			if (body) notes.push({ id: `${id}~note${noteIndex++}`, contactId: id, body, isFavorited: false, createdAt: null });
		}

		for (const p of all('CATEGORIES')) {
			for (const name of splitEscaped(p.raw, ',').map((c) => orNull(unescape(c)))) {
				if (!name) continue;
				const members = tagContacts.get(name) ?? [];
				if (!members.includes(id)) members.push(id);
				tagContacts.set(name, members);
			}
		}

		let avatarPhotoId: string | null = null;
		let photoIndex = 0;
		for (const p of all('PHOTO')) {
			const photo = readPhoto(p, `${id}~photo${photoIndex++}`, id);
			if (!photo) continue;
			photos.push(photo);
			avatarPhotoId ??= String(photo.id);
		}

		const genderCode = orNull(splitEscaped(first('GENDER')?.raw ?? '', ';')[0])?.toUpperCase() ?? null;
		const gender = genderCode !== null && GENDER_CODES.includes(genderCode) ? genderCode : null;
		if (gender) genderCodes.add(gender);

		const org = first('ORG') ? splitEscaped(first('ORG')!.raw, ';').map(unescape) : [];
		contacts.push({
			id,
			firstName,
			middleName: orNull(structured[2]),
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

	const tags: MonicaTag[] = [...tagContacts.entries()].map(([name, contactIds], i) => ({
		id: `tag-${i + 1}`,
		name,
		contactIds
	}));
	const genders: MonicaGender[] = [...genderCodes].map((code) => ({ id: code, type: code, name: code }));

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
		lifeEvents: [],
		pets: [],
		journalEntries: [],
		userCount: 1,
		derivedReminderCount: 0
	};
}
