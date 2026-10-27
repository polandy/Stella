import { partialDateOfDay, type PartialDate } from '../../../dates/partial-date';
import {
	fullName,
	type CardField,
	type CardLabel,
	type IncomingCard,
	type KnownLabel
} from '../../../import-match/card';
import { foldName, normaliseEmail, normalisePhone } from '../../../import-match/normalise';
import {
	cardFingerprint,
	orNull,
	parseDay,
	readAddress,
	readName,
	readPhoto,
	splitCards,
	splitEscaped,
	unescape,
	type Property
} from './vcard-lines';
import { detectSource, ownCategories, type VCardSource } from './vcard-source';

/*
 * A vCard read for the matching review (docs/concepts/contact-sources.md §1.1–1.4): each card
 * as the facts the review compares, under a key that stays the same from one export of the
 * address book to the next. A new person is still created through `readVCard` and the mapping.
 */

export interface ContactCards {
	source: VCardSource;
	cards: IncomingCard[];
	/** Cards whose picture is only a link (Google's), which the report counts. */
	linkPhotos: number;
}

/** The vCard types that name one of Stella's own labels; the rest (`INTERNET`, `VOICE`, …) say nothing. */
const KNOWN_TYPES: Record<string, KnownLabel> = { HOME: 'home', WORK: 'work', CELL: 'mobile' };

/** Google's photo URL carries the contact's id, the one thing about a Google card that lasts. */
const GOOGLE_CONTACT_ID = /googleusercontent\.com\/contacts\/([^/?#=]+)/i;

/**
 * Properties that change on every save without saying anything new; a card that differs only
 * in these is not a changed card.
 */
const STAMPS = ['REV', 'PRODID'];

/** A custom label (`itemN.X-ABLabel`) wins; else the first type Stella has a label for. */
function labelOf(property: Property, card: Property[]): CardLabel | null {
	if (property.group !== null) {
		const typed = card.find((p) => p.group === property.group && p.name === 'X-ABLABEL');
		const text = orNull(unescape(typed?.raw ?? ''));
		if (text) return { typed: text };
	}
	// vCard 2.1 writes a type as a bare parameter (`TEL;CELL:`), so its name counts too.
	const types = [...(property.params.get('TYPE') ?? []), ...property.params.keys()];
	for (const type of types) {
		const known = KNOWN_TYPES[type.toUpperCase()];
		if (known) return { known };
	}
	return null;
}

/** The line Stella stores an address as, the same join the mapping makes (`plan.ts`). */
function addressLine(property: Property): string | null {
	const a = readAddress(property);
	const cityLine = orNull([a.postalCode, a.city].filter(Boolean).join(' '));
	return orNull([a.street, cityLine, a.province, a.country].filter(Boolean).join(', '));
}

function birthdayOf(property: Property | undefined): PartialDate | null {
	const day = property ? parseDay(unescape(property.raw)) : null;
	if (!day) return null;
	return partialDateOfDay(day.isYearUnknown ? `--${day.date.slice(5)}` : day.date);
}

/**
 * The card's key: its UID, else Google's contact id from its photo, else its folded name and
 * first email or number — so a renamed Google contact without a picture is new next time,
 * and matches its person strongly by that email or number (§1.4).
 */
function keyOf(card: Property[], incoming: Omit<IncomingCard, 'key' | 'hash'>): string {
	const uid = orNull(card.find((p) => p.name === 'UID')?.raw)?.replace(/^urn:uuid:/i, '');
	if (uid) return uid;
	for (const photo of card.filter((p) => p.name === 'PHOTO')) {
		const id = GOOGLE_CONTACT_ID.exec(photo.raw)?.[1];
		if (id) return `photo:${id}`;
	}
	const email = incoming.emails[0]?.value;
	const phone = incoming.phones[0] && normalisePhone(incoming.phones[0].value);
	const reach = email
		? normaliseEmail(email)
		: (phone?.international ?? incoming.phones[0]?.value.replace(/\D/g, '') ?? '');
	return `name:${foldName(fullName(incoming))}|${reach}`;
}

function readCard(card: Property[], index: number, source: VCardSource) {
	const first = (name: string) => card.find((p) => p.name === name);
	const fields = (name: string, value: (p: Property) => string | null): CardField[] =>
		card
			.filter((p) => p.name === name)
			.flatMap((p) => {
				const text = value(p);
				return text === null ? [] : [{ value: text, label: labelOf(p, card) }];
			});
	const text = (p: Property) => orNull(unescape(p.raw));

	const { firstName, lastName, formatted } = readName(card, index);
	const photos = card.filter((p) => p.name === 'PHOTO');
	const org = first('ORG') ? splitEscaped(first('ORG')!.raw, ';').map(unescape) : [];
	const incoming: Omit<IncomingCard, 'key' | 'hash'> = {
		firstName,
		lastName,
		displayName: formatted ?? [firstName, lastName].filter(Boolean).join(' '),
		nickname: orNull(splitEscaped(first('NICKNAME')?.raw ?? '', ',').map(unescape)[0]),
		company: orNull(org[0]),
		jobTitle: orNull(unescape(first('TITLE')?.raw ?? '')),
		birthday: birthdayOf(first('BDAY')),
		emails: fields('EMAIL', text),
		phones: fields('TEL', text),
		addresses: fields('ADR', addressLine),
		urls: fields('URL', text),
		tags: ownCategories(card, source),
		photo: photos.some((p) => readPhoto(p, 'photo', 'card') !== null)
			? 'inline'
			: photos.length > 0
				? 'link'
				: null
	};
	return {
		...incoming,
		key: keyOf(card, incoming),
		hash: cardFingerprint(card.filter((p) => !STAMPS.includes(p.name)))
	};
}

/** Read a vCard file into the cards the matching review compares. Pure. */
export function readContactCards(text: string): ContactCards {
	const properties = splitCards(text);
	const source = detectSource(properties);
	const seen = new Map<string, number>();
	const cards = properties.map((card, index) => {
		const read = readCard(card, index, source);
		// Two cards with one key would share one remembered answer; the second is told apart.
		const count = (seen.get(read.key) ?? 0) + 1;
		seen.set(read.key, count);
		return count === 1 ? read : { ...read, key: `${read.key}~${count}` };
	});
	return { source, cards, linkPhotos: cards.filter((c) => c.photo === 'link').length };
}
