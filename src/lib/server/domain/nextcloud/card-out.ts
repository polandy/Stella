import type { PartialDate } from '../../../dates/partial-date';
import type { CardField, CardLabel, KnownLabel } from '../../../import-match/card';
import { addressLine, labelOf } from '../import/contact-cards';
import {
	fingerprint,
	parseLine,
	splitEscaped,
	unescape,
	unfold,
	type Property
} from '../import/vcard-lines';

/*
 * A linked person written onto their Nextcloud card (docs/02 §2.16.3). Only the kept-in-step
 * facts are Stella's to write — name, phones, emails, addresses, birthday, photo — so the card
 * is rebuilt from the text the book last gave: every other line stays exactly as it was, and a
 * line that already says what Stella holds is kept too, with its label and whatever a phone
 * tied to it. Pure: the person comes in as plain values, the card goes out as text.
 */

/** The picture Stella sends: its avatar file, and a fingerprint of the bytes for the hash. */
export interface CardPhotoOut {
	mime: string;
	base64: string;
	fingerprint: string;
}

/** A linked person, as far as their card holds them. Addresses include their homes' lines. */
export interface PersonOnCard {
	firstName: string | null;
	lastName: string | null;
	displayName: string;
	birthday: PartialDate | null;
	phones: CardField[];
	emails: CardField[];
	addresses: CardField[];
	/** Null leaves the card's picture as it is: Stella has none to send. */
	photo: CardPhotoOut | null;
}

/**
 * What the card holds of the person, changed by any kept-in-step fact and nothing else: a
 * different hash than the one stored with the card is a change in Stella to write out.
 */
export function stellaHash(person: PersonOnCard): string {
	return fingerprint(
		JSON.stringify([
			person.firstName,
			person.lastName,
			person.birthday,
			person.phones,
			person.emails,
			person.addresses,
			person.photo?.fingerprint ?? null
		])
	);
}

const TYPE_OF: Record<KnownLabel, string> = { home: 'HOME', work: 'WORK', mobile: 'CELL' };

/** The properties Stella writes; any other line of the card is left alone. */
const WRITTEN = ['N', 'FN', 'TEL', 'EMAIL', 'ADR'];

/** A save stamp the rebuilt card would carry wrongly; the book's etag says when it changed. */
const DROPPED = ['REV'];

/** Most octets on one line before it folds (RFC 6350 §3.2). */
const FOLD_AT = 75;

/** Escape a text value (RFC 6350 §3.4). */
const escapeText = (value: string) =>
	value
		.replace(/\\/g, '\\\\')
		.replace(/\r?\n/g, '\\n')
		.replace(/,/g, '\\,')
		.replace(/;/g, '\\;');

interface Line {
	text: string;
	property: Property;
}

const sameLabel = (a: CardLabel | null, b: CardLabel | null) =>
	JSON.stringify(a) === JSON.stringify(b);

/** Fold a line at 75 octets without splitting a character's bytes. */
function fold(line: string): string {
	const encoder = new TextEncoder();
	const out: string[] = [];
	let current = '';
	let size = 0;
	for (const char of line) {
		const bytes = encoder.encode(char).length;
		const limit = out.length === 0 ? FOLD_AT : FOLD_AT - 1;
		if (size + bytes > limit) {
			out.push(current);
			current = '';
			size = 0;
		}
		current += char;
		size += bytes;
	}
	out.push(current);
	return out.join('\r\n ');
}

/** A birthday as the card's version writes it; null when Stella's is not a day. */
function birthdayValue(birthday: PartialDate | null, v4: boolean): string | null {
	if (birthday?.precision === 'full') {
		return v4 ? birthday.value.replace(/-/g, '') : birthday.value;
	}
	if (birthday?.precision === 'month_day') {
		return v4 ? `--${birthday.value.slice(2).replace('-', '')}` : birthday.value;
	}
	return null;
}

function photoLine({ mime, base64 }: CardPhotoOut, v4: boolean): string {
	if (v4) return `PHOTO:data:${mime};base64,${base64}`;
	const type = (mime.split('/')[1] ?? 'jpeg').toUpperCase();
	return `PHOTO;ENCODING=b;TYPE=${type}:${base64}`;
}

/** Rebuild `base` — the card as the book last gave it — to hold `person`. */
export function writeCard(base: string, person: PersonOnCard): string {
	const lines: Line[] = unfold(base).flatMap((text) => {
		const property = parseLine(text);
		return property && property.name !== 'BEGIN' && property.name !== 'END'
			? [{ text, property }]
			: [];
	});
	const props = lines.map((l) => l.property);
	const version = props.find((p) => p.name === 'VERSION')?.raw.trim() ?? '3.0';
	const v4 = version.startsWith('4');
	const bday = birthdayValue(person.birthday, v4);

	const written = new Set(WRITTEN);
	if (bday !== null) written.add('BDAY');
	if (person.photo) written.add('PHOTO');

	// A phone ties a label (and Apple an address's country) to its value by a group; those lines
	// belong to the value, and go or stay with it.
	const writtenGroups = new Set(
		props.filter((p) => written.has(p.name) && p.group !== null).map((p) => p.group!)
	);
	const ownLine = (l: Line) => !written.has(l.property.name) && !DROPPED.includes(l.property.name);
	const kept = lines.filter(
		(l) => ownLine(l) && (l.property.group === null || !writtenGroups.has(l.property.group))
	);
	const usedGroups = new Set(lines.flatMap((l) => (l.property.group ? [l.property.group] : [])));
	let nextItem = 1;
	const freshGroup = () => {
		while (usedGroups.has(`item${nextItem}`)) nextItem++;
		usedGroups.add(`item${nextItem}`);
		return `item${nextItem}`;
	};

	/** Each value: the card's own line(s) when one says the same, else a new line. */
	function fieldLines(
		name: string,
		fields: CardField[],
		valueOf: (p: Property) => string | null,
		write: (value: string) => string
	): string[] {
		const free = lines.filter((l) => l.property.name === name);
		return fields.flatMap((field) => {
			const same = free.findIndex(
				(l) =>
					valueOf(l.property) === field.value &&
					sameLabel(labelOf(l.property, props), field.label)
			);
			if (same !== -1) {
				const [line] = free.splice(same, 1);
				const group = line!.property.group;
				const tied = group
					? lines.filter((l) => l.property.group === group && l !== line && ownLine(l))
					: [];
				return [line!.text, ...tied.map((l) => l.text)];
			}
			const label = field.label;
			if (label && 'typed' in label) {
				const group = freshGroup();
				return [`${group}.${name}:${write(field.value)}`, `${group}.X-ABLABEL:${escapeText(label.typed)}`];
			}
			const type = label ? `;TYPE=${TYPE_OF[label.known]}` : '';
			return [`${name}${type}:${write(field.value)}`];
		});
	}

	const n = props.find((p) => p.name === 'N');
	const nameParts = n ? splitEscaped(n.raw, ';') : [];
	while (nameParts.length < 5) nameParts.push('');
	nameParts[0] = escapeText(person.lastName ?? '');
	nameParts[1] = escapeText(person.firstName ?? '');
	const formatted =
		[person.firstName, person.lastName].filter(Boolean).join(' ') || person.displayName;

	const text = (p: Property) => unescape(p.raw).trim() || null;
	const out = [
		'BEGIN:VCARD',
		...kept.filter((l) => l.property.name === 'VERSION').map((l) => l.text),
		...(kept.some((l) => l.property.name === 'VERSION') ? [] : ['VERSION:3.0']),
		...kept.filter((l) => l.property.name !== 'VERSION').map((l) => l.text),
		`FN:${escapeText(formatted)}`,
		`N:${nameParts.join(';')}`,
		...fieldLines('TEL', person.phones, text, escapeText),
		...fieldLines('EMAIL', person.emails, text, escapeText),
		// A home is one line in Stella; it goes out as the street, which reads back as that line.
		...fieldLines('ADR', person.addresses, addressLine, (v) => `;;${escapeText(v)};;;;`),
		...(bday === null ? [] : [`BDAY:${bday}`]),
		...(person.photo ? [photoLine(person.photo, v4)] : []),
		'END:VCARD'
	];
	return out.map(fold).join('\r\n') + '\r\n';
}
