import { LOCALES, type Locale } from '../i18n/locales';

/*
 * Derive a contact's display name — pure (docs/03 §contact: display_name is required and
 * never empty). Priority: explicit name → what the parts make → error. The parts make
 * *Thomas „Tom“ Brunner*: first name, the nickname in quotes, last name (docs/02 §2.2).
 *
 * Shared by the server and the profile's name editor, which shows *Shown as* following the
 * parts while they are typed by the very rule the server applies on save (docs/02 §2.2).
 */

export interface NameParts {
	displayName?: string | null;
	firstName?: string | null;
	lastName?: string | null;
	nickname?: string | null;
}

const clean = (value?: string | null): string => (value ?? '').trim();

/**
 * The quote marks a nickname is set in, by the language the name is written in. The stored name
 * is data, not interface copy: the pair is chosen once, when the name is written, and stays.
 */
export const NICKNAME_QUOTES: Readonly<Record<Locale, readonly [open: string, close: string]>> = {
	en: ['“', '”'],
	de: ['„', '“']
};

const fold = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * What the parts make: *Thomas „Tom“ Brunner*. A nickname that is the first name again (ignoring
 * case and accents) is left out; with no first name it stands in for one, unquoted (*Tom
 * Brunner*); alone, it is the name. Null when there are no parts.
 */
function nameFromParts(parts: NameParts, locale: Locale): string | null {
	const first = clean(parts.firstName);
	const last = clean(parts.lastName);
	let nickname = clean(parts.nickname);
	if (nickname && fold(nickname) === fold(first)) nickname = '';
	const [open, close] = NICKNAME_QUOTES[locale];
	const words = first
		? [first, nickname ? `${open}${nickname}${close}` : '', last]
		: [nickname, last];
	return words.filter(Boolean).join(' ') || null;
}

/** What the parts made before the nickname joined the name: first and last, else the nickname. */
function nameFromPartsBefore(parts: NameParts): string | null {
	const fullName = [clean(parts.firstName), clean(parts.lastName)].filter(Boolean).join(' ');
	return fullName || clean(parts.nickname) || null;
}

/**
 * Whether the shown name is one the parts make — by today's rule in either language's quote
 * marks, or by the rule before the nickname joined it — so older rows and archives still count
 * as following their parts rather than as names somebody chose.
 */
function followsParts(name: NameParts): boolean {
	const shown = clean(name.displayName);
	const made = [nameFromPartsBefore(name), ...LOCALES.map((locale) => nameFromParts(name, locale))];
	return made.some((candidate) => candidate !== null && candidate === shown);
}

export function deriveDisplayName(parts: NameParts, locale: Locale): string {
	const explicit = clean(parts.displayName);
	if (explicit) return explicit;

	const fromParts = nameFromParts(parts, locale);
	if (fromParts) return fromParts;

	throw new Error('A contact needs at least a name or nickname.');
}

/**
 * The one-off update of the names stored before the nickname joined them (docs/03 §contact):
 * the new name for a row whose shown name the old rule made and whose nickname now shows, or
 * null for a row to leave alone — a chosen name (*Opa Kurt*), no nickname, or a nickname that
 * is the first name again. The migration applies this rule; its test holds the two together.
 */
export function nameWithNickname(row: StoredName, locale: Locale): string | null {
	if (!clean(row.nickname) || clean(row.displayName) !== nameFromPartsBefore(row)) return null;
	const next = nameFromParts(row, locale);
	return next !== null && next !== clean(row.displayName) ? next : null;
}

/** A person's name as stored: the parts, and the shown name that is never empty. */
export interface StoredName {
	displayName: string;
	firstName: string | null;
	lastName: string | null;
	nickname: string | null;
}

/** The parts being changed; a part left out stays as it is, a blank one is taken off. */
export type NamePartsChange = Partial<Pick<StoredName, 'firstName' | 'lastName' | 'nickname'>>;

const orNull = (value: string | null): string | null => clean(value) || null;

/**
 * The name after its parts change (docs/02 §2.2, ADR-106), the one rule every path that
 * changes a part goes through — the profile and the bulk paths alike, so a shown name follows
 * its parts the same way wherever they change.
 *
 * A shown name the old parts made is made again from the new ones; one a member chose (*Opa
 * Hans*) is kept, because it was chosen. A person given a last name without ever having had a
 * first name — typical of a single-word import (*Thomas*) — gets that one word as their first
 * name in the same write, so there are parts to work from. A shown name of **several** words
 * with no parts at all is ambiguous (*Opa Hans* is as plausible as an untouched import), so the
 * first word is never guessed into the first name there — the person keeps no first name until
 * one is typed. Emptying every part leaves the shown name standing: it is never empty.
 */
export function withNameParts(
	current: StoredName,
	change: NamePartsChange,
	locale: Locale
): StoredName {
	const pick = (key: keyof NamePartsChange) =>
		change[key] === undefined ? orNull(current[key]) : orNull(change[key] ?? null);
	let firstName = pick('firstName');
	const lastName = pick('lastName');
	const nickname = pick('nickname');

	let before: NameParts = current;
	const shownWords = clean(current.displayName).split(/\s+/).filter(Boolean);
	if (!clean(current.firstName) && !firstName && lastName && shownWords.length === 1) {
		firstName = shownWords[0]!;
		before = { ...current, firstName };
	}

	const displayName =
		(followsParts({ ...before, displayName: current.displayName }) &&
			nameFromParts({ firstName, lastName, nickname }, locale)) ||
		current.displayName;
	return { displayName, firstName, lastName, nickname };
}

/**
 * Whether a member chose the shown name rather than letting the parts make it — so a changed
 * part will not reach it, and the editor says so instead of leaving anyone wondering (§6).
 */
export function shownNameIsChosen(name: StoredName): boolean {
	return nameFromPartsBefore(name) !== null && !followsParts(name);
}

/**
 * The whole name as the profile's one editor sends it (docs/02 §2.2): the parts and *Shown as*.
 * A shown name that comes back as it was stored, while it was following the parts, is made
 * again from the new parts (`withNameParts`) — so a form without the live update, or one left
 * open while the parts were typed, still follows them. A shown name typed by the member is
 * stored as typed; a blank one means *follow the parts*. Null when nothing names the person at
 * all — the caller refuses that, since the shown name is never empty.
 */
export function withNameEdit(
	current: StoredName,
	change: NamePartsChange,
	shownName: string,
	locale: Locale
): StoredName | null {
	const next = withNameParts(current, change, locale);
	const typed = clean(shownName);
	if (typed === '') {
		const fromParts = nameFromParts(next, locale);
		return fromParts === null ? null : { ...next, displayName: fromParts };
	}
	if (typed === clean(current.displayName) && !shownNameIsChosen(current)) return next;
	return { ...next, displayName: typed };
}
