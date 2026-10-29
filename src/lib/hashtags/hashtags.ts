import { AVATAR_ACCENTS } from '../design/tokens';

/*
 * The grammar of a tag on a journal entry (docs/02 §2.20.2). A tag is written into the text as
 * `#word`; the entry's tags are what its text says, so the server reads them from the body on
 * every write and the renderer turns the same words into chips. One reading, shared by both.
 */

/** A tag's characters: letters (umlauts, in either composition), digits and `_`. */
const WORD = String.raw`[\p{L}\p{M}\p{N}_]+`;

/** A word, with a hyphen allowed only between two words, so `#walk-` is `#walk`. */
const NAME = new RegExp(`^${WORD}(?:-${WORD})*`, 'u');

/** What may not stand right before the `#`: a word, an escape, an entity, a path, another `#`. */
const NO_BOUNDARY = /[\p{L}\p{M}\p{N}_\\&/#]/u;

const HAS_LETTER = /\p{L}/u;

/** Fenced code and code spans, where a `#` is code, not a tag. */
const CODE = /^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$|`[^`\n]*`/gmu;

/** The tag whose `#` stands at `at` in `text`, with the index just past it, or null. */
export function hashtagAt(text: string, at: number): { name: string; end: number } | null {
	if (text[at] !== '#') return null;
	if (at > 0 && NO_BOUNDARY.test(text[at - 1])) return null;
	const m = NAME.exec(text.slice(at + 1));
	if (!m || !HAS_LETTER.test(m[0])) return null;
	return { name: m[0].normalize('NFC'), end: at + 1 + m[0].length };
}

/** The key two spellings of one tag share: case and composition folded. */
export function tagKey(name: string): string {
	return name.normalize('NFC').toLowerCase();
}

/** The tags `body` carries, each once in the spelling it first appears in. */
export function hashtagsIn(body: string): string[] {
	const text = body.replace(CODE, (code) => ' '.repeat(code.length));
	const seen = new Map<string, string>();
	for (let at = text.indexOf('#'); at >= 0; at = text.indexOf('#', at + 1)) {
		const tag = hashtagAt(text, at);
		if (!tag) continue;
		const key = tagKey(tag.name);
		if (!seen.has(key)) seen.set(key, tag.name);
		at = tag.end - 1;
	}
	return [...seen.values()];
}

/** A tag's colour, derived from its key so every spelling and every screen agree. */
export function tagAccent(name: string): (typeof AVATAR_ACCENTS)[number] {
	const key = tagKey(name);
	let hash = 0;
	for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
	return AVATAR_ACCENTS[hash % AVATAR_ACCENTS.length];
}

/** Where a tag chip on one person's entry leads: their journal, filtered by the tag. */
export function journalTagHref(contactId: string): (key: string) => string {
	return (key) => `/contacts/${contactId}/journal?tag=${encodeURIComponent(key)}`;
}

/**
 * Where a tag chip in a journal's filter row leads, relative to the journal: an unchosen tag joins
 * the chosen ones — an entry must then carry them all — and a chosen one is taken off.
 */
export function journalTagToggle(chosen: readonly string[], key: string): string {
	const keys = chosen.includes(key) ? chosen.filter((k) => k !== key) : [...chosen, key];
	return `?${new URLSearchParams(keys.map((k) => ['tag', k]))}`;
}

/** The list of every tag the viewer can see (docs/02 §2.20.2). */
export const TAGS_PAGE = '/tags';

/**
 * Where a tag chip leads outside one person's journal — on Home, a person's Activity, search:
 * the tag's own page, its moments across the household.
 */
export function tagPageHref(key: string): string {
	return `${TAGS_PAGE}/${encodeURIComponent(key)}`;
}
