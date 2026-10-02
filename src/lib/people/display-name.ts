/*
 * Derive a contact's display name — pure (docs/03 §contact: display_name is required and
 * never empty). Priority: explicit name → first+last → first → last → nickname.
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

export function deriveDisplayName(parts: NameParts): string {
	const explicit = clean(parts.displayName);
	if (explicit) return explicit;

	const fullName = [clean(parts.firstName), clean(parts.lastName)].filter(Boolean).join(' ');
	if (fullName) return fullName;

	const nickname = clean(parts.nickname);
	if (nickname) return nickname;

	throw new Error('A contact needs at least a name or nickname.');
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

/** What the parts alone would show, or null when there are none. */
function nameFromParts(parts: NameParts): string | null {
	const fullName = [clean(parts.firstName), clean(parts.lastName)].filter(Boolean).join(' ');
	return fullName || clean(parts.nickname) || null;
}

const orNull = (value: string | null): string | null => clean(value) || null;

/**
 * The name after its parts change (docs/concepts/surnames.md §6), the one rule every path that
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
export function withNameParts(current: StoredName, change: NamePartsChange): StoredName {
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

	const madeByParts = nameFromParts({ ...before, displayName: null }) === clean(current.displayName);
	const displayName = (madeByParts && nameFromParts({ firstName, lastName, nickname })) || current.displayName;
	return { displayName, firstName, lastName, nickname };
}

/**
 * Whether a member chose the shown name rather than letting the parts make it — so a changed
 * part will not reach it, and the editor says so instead of leaving anyone wondering (§6).
 */
export function shownNameIsChosen(name: StoredName): boolean {
	const fromParts = nameFromParts({ ...name, displayName: null });
	return fromParts !== null && fromParts !== clean(name.displayName);
}

/**
 * The whole name as the profile's one editor sends it (docs/02 §2.2): the parts and *Shown as*.
 * A shown name that comes back as it was stored, while it was following the parts, is made
 * again from the new parts (`withNameParts`) — so a form without the live update, or one left
 * open while the parts were typed, still follows them. A shown name typed by the member is
 * stored as typed; a blank one means *follow the parts*. Null when nothing names the person at
 * all — the caller refuses that, since the shown name is never empty.
 */
export function withNameEdit(current: StoredName, change: NamePartsChange, shownName: string): StoredName | null {
	const next = withNameParts(current, change);
	const typed = clean(shownName);
	if (typed === '') {
		const fromParts = nameFromParts(next);
		return fromParts === null ? null : { ...next, displayName: fromParts };
	}
	if (typed === clean(current.displayName) && !shownNameIsChosen(current)) return next;
	return { ...next, displayName: typed };
}
