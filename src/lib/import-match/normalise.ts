/*
 * The spellings two address books share (docs/concepts/contact-sources.md §1.2). Matching
 * compares these and nothing looser: a near-match taken for the same person would write one
 * person's facts onto another without anyone noticing.
 */

/** An email as every address book means it: no case, no surrounding space. */
export const normaliseEmail = (value: string): string => value.trim().toLowerCase();

/**
 * A phone number reduced to what can be compared. `international` is `+` and digits when the
 * number names its country (`+41 …` or `0041 …`), else null. `tail` is its last nine digits,
 * which is how a national `079 …` is compared without knowing the household's country; null
 * when the number is shorter than that and too short to say anything.
 */
export interface NormalisedPhone {
	international: string | null;
	tail: string | null;
}

/** How many trailing digits a national number is compared by. */
const TAIL = 9;

export function normalisePhone(value: string): NormalisedPhone {
	const trimmed = value.trim();
	const digits = trimmed.replace(/\D/g, '');
	const international = trimmed.startsWith('+')
		? `+${digits}`
		: digits.startsWith('00')
			? `+${digits.slice(2)}`
			: null;
	return { international, tail: digits.length >= TAIL ? digits.slice(-TAIL) : null };
}

/**
 * Whether two numbers are one: `same` when both name their country and agree, `alike` when
 * one has no country and their last nine digits agree — enough to suggest a person, never to
 * be sure of them — and `different` otherwise.
 */
export function samePhone(a: NormalisedPhone, b: NormalisedPhone): 'same' | 'alike' | 'different' {
	if (a.international !== null && b.international !== null) {
		return a.international === b.international ? 'same' : 'different';
	}
	return a.tail !== null && a.tail === b.tail ? 'alike' : 'different';
}

/**
 * A name reduced to what two spellings of it share: no case, no accents, any word order — the
 * API import's folding for its possible duplicates (docs/02 §2.16.1).
 */
export function foldName(name: string): string {
	return name
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean)
		.sort()
		.join(' ');
}

/** A free-text value as two spellings of it share it: no case, single spaces. */
export const foldText = (value: string): string => value.trim().replace(/\s+/g, ' ').toLowerCase();
