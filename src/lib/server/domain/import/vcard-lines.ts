import { TranslatableError } from '../../../i18n/translatable';
import { phrase, type Phrase } from '../../../i18n/phrase';
import type { MonicaPhoto } from './monica/monica-export';

/*
 * The vCard format itself (RFC 6350 for 4.0, RFC 2426 for 3.0, and 2.1's quoted-printable):
 * cards, content lines, escapes. Both readers stand on it — `readVCard` for a fresh import,
 * `readContactCards` for the matching review (docs/02 §2.16).
 *
 * Hand-rolled rather than pulled from a package: the subset a contacts export uses is small
 * and stable, and every published parser brings a dependency far larger than the two dozen
 * lines of unfolding and unescaping it saves.
 */

/** The file is not a vCard, or a card in it is broken. Carries a message meant for the admin. */
export class VCardError extends TranslatableError {
	constructor(message: Phrase) {
		super(message, 'VCardError');
	}
}

/** vCard 2.1's text encoding, named in an `ENCODING` parameter and folded with a trailing `=`. */
const QUOTED_PRINTABLE = /QUOTED-PRINTABLE/i;

const BEGIN = 'BEGIN:VCARD';
const END = 'END:VCARD';

export interface Property {
	/** The group prefix (`item1` of `item1.EMAIL`), which ties a label to its value. */
	group: string | null;
	name: string;
	/** Each parameter's values; one named twice (`TYPE=INTERNET;TYPE=HOME`) keeps both. */
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
export function splitEscaped(value: string, separator: string): string[] {
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
export function unescape(value: string): string {
	return value.replace(/\\([\\,;nN])/g, (_, char: string) =>
		char === 'n' || char === 'N' ? '\n' : char
	);
}

/** Parse one content line into group, name, parameters and the still-escaped value. */
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
	const dot = head!.lastIndexOf('.');
	const name = head!
		.slice(dot + 1)
		.trim()
		.toUpperCase();
	const group = dot === -1 ? null : head!.slice(0, dot).trim().toLowerCase() || null;
	const params = new Map<string, string[]>();
	for (const part of paramParts) {
		const eq = part.indexOf('=');
		const key = (eq === -1 ? part : part.slice(0, eq)).trim().toUpperCase();
		const rawValue = eq === -1 ? part : part.slice(eq + 1);
		const values = rawValue
			.split(',')
			.map((v) => v.trim().replace(/^"|"$/g, ''))
			.filter((v) => v.length > 0);
		params.set(key, [...(params.get(key) ?? []), ...values]);
	}
	const value = line.slice(colon + 1);
	const encoding = params.get('ENCODING')?.[0] ?? '';
	return {
		group,
		name,
		params,
		raw: QUOTED_PRINTABLE.test(encoding) ? decodeQuotedPrintable(value) : value
	};
}

/** Split the file into cards, rejecting anything that is not one. */
export function splitCards(text: string): Property[][] {
	const lines = unfold(text);
	const cards: Property[][] = [];
	let current: Property[] | null = null;
	for (const line of lines) {
		const upper = line.trim().toUpperCase();
		if (upper === BEGIN) {
			if (current) throw new VCardError(phrase('import.error.vcardOverlap'));
			current = [];
			continue;
		}
		if (upper === END) {
			if (!current) throw new VCardError(phrase('import.error.vcardEndWithoutBegin'));
			cards.push(current);
			current = null;
			continue;
		}
		if (!current) continue;
		const property = parseLine(line);
		if (property) current.push(property);
	}
	if (current) throw new VCardError(phrase('import.error.vcardUnclosed'));
	if (cards.length === 0) throw new VCardError(phrase('import.error.notVcard'));
	return cards;
}

/**
 * A short, stable, URL-safe fingerprint of a string. Two 32-bit FNV-1a rounds rather than a
 * digest: this has to be synchronous and dependency-free, and 64 bits is far more than an
 * address book needs to keep two records apart.
 */
export function fingerprint(text: string): string {
	const round = (seed: number) => {
		let hash = seed;
		for (let i = 0; i < text.length; i++) {
			hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
		}
		return (hash >>> 0).toString(16).padStart(8, '0');
	};
	return round(0x811c9dc5) + round(0x9dc5811c);
}

/** What a card is, for the times it does not say who it is: every property it carries. */
export const cardFingerprint = (properties: Property[]) =>
	fingerprint(properties.map((p) => `${p.name}:${p.raw}`).join('\n'));

export const orNull = (value: string | undefined): string | null => {
	const trimmed = (value ?? '').trim();
	return trimmed.length > 0 ? trimmed : null;
};

/** The card's name parts: structured `N` first, the formatted `FN` when that is all there is. */
export function readName(card: Property[], index: number) {
	const first = (name: string) => card.find((p) => p.name === name);
	const structured = first('N') ? splitEscaped(first('N')!.raw, ';').map(unescape) : [];
	const formatted = orNull(unescape(first('FN')?.raw ?? ''));
	const lastName = orNull(structured[0]);
	const firstName = orNull(structured[1]) ?? (lastName === null ? formatted : null);
	if (firstName === null && lastName === null) {
		throw new VCardError(phrase('import.error.vcardNameless', { index: index + 1 }));
	}
	return { firstName, middleName: orNull(structured[2]), lastName, formatted };
}

/** A vCard date, which may withhold the year (`--0407`). Null when it is free text. */
export function parseDay(raw: string): { date: string; isYearUnknown: boolean } | null {
	const value = raw.trim().split('T')[0]!;
	const full = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(value);
	if (full) return { date: `${full[1]}-${full[2]}-${full[3]}`, isYearUnknown: false };
	const noYear = /^--(\d{2})-?(\d{2})$/.exec(value);
	if (noYear) return { date: `0000-${noYear[1]}-${noYear[2]}`, isYearUnknown: true };
	return null;
}

/** An `ADR`'s parts (RFC 6350 §6.3.1: po box; extended; street; locality; region; code; country). */
export function readAddress(property: Property) {
	const parts = splitEscaped(property.raw, ';').map(unescape);
	return {
		street: orNull([parts[2], parts[1]].filter(Boolean).join(', ')),
		city: orNull(parts[3]),
		province: orNull(parts[4]),
		postalCode: orNull(parts[5]),
		country: orNull(parts[6])
	};
}

/** The categories a card is in, each once. */
export function readCategories(card: Property[]): string[] {
	const names: string[] = [];
	for (const p of card.filter((q) => q.name === 'CATEGORIES')) {
		for (const name of splitEscaped(p.raw, ',').map((c) => orNull(unescape(c)))) {
			if (name && !names.includes(name)) names.push(name);
		}
	}
	return names;
}

/** Bytes a base64 payload decodes to, without decoding it. */
function base64Size(payload: string): number {
	const clean = payload.replace(/\s/g, '');
	const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
	return Math.max(0, (clean.length / 4) * 3 - padding);
}

/** The picture a card carries, or null when it only points at one somewhere else. */
export function readPhoto(property: Property, id: string, contactId: string): MonicaPhoto | null {
	// A data URI is a URI value, and Nextcloud's web app escapes its comma (`base64\,`); the
	// base64 alphabet has no backslash, so unescaping cannot touch the picture itself.
	const value = unescape(property.raw.trim());
	if (value.startsWith('data:')) {
		const mime = /^data:([^;,]+)/.exec(value)?.[1] ?? 'image/jpeg';
		const payload = value.slice(value.indexOf(',') + 1);
		return {
			id,
			path: `${id}.bin`,
			dataUrl: value,
			mime,
			sizeBytes: base64Size(payload),
			contactId,
			createdAt: null
		};
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
