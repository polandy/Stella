import { hashtagAt, hashtagsIn, tagKey } from './hashtags';

/*
 * Pure helpers behind the `#` picker (docs/02 §2.20.2), the `@` picker's sibling: find the tag
 * being typed at the caret, rank the household's tags for it, and splice the choice back in.
 */

/** Max tags the picker shows. */
export const TAG_PICKER_LIMIT = 6;

/** A tag the viewer can see, as the shell hands it to every picker. */
export interface KnownTag {
	name: string;
	key: string;
	/** Entries the viewer can read that carry it. */
	count: number;
	/** Only on private entries, so only their author sees it. */
	onlyPrivate: boolean;
}

/** The same boundary as the parser's, `#` plus whatever word is typed so far. */
const TAG_AT_CARET = /(?<![\p{L}\p{M}\p{N}_\\&/#])#([\p{L}\p{M}\p{N}_-]*)$/u;

export interface ActiveHashtag {
	/** Index of the `#`. */
	start: number;
	/** Text typed after the `#`, empty right after typing it. */
	query: string;
}

/** The tag being typed, ending exactly at the caret, or null. */
export function activeHashtag(text: string, caret: number): ActiveHashtag | null {
	const m = TAG_AT_CARET.exec(text.slice(0, caret));
	if (!m) return null;
	return { start: caret - m[0].length, query: m[1] };
}

export interface TagSuggestions<T extends KnownTag> {
	tags: T[];
	/** The typed name to offer as a new tag, or null when it is one already or not a tag. */
	create: string | null;
}

/** Name starts first, then inner matches; within each, the most used first. */
export function suggestTags<T extends KnownTag>(
	query: string,
	known: readonly T[],
	limit = TAG_PICKER_LIMIT
): TagSuggestions<T> {
	const q = tagKey(query);
	const tags = known
		.map((t) => ({ t, rank: !q || t.key.startsWith(q) ? 0 : t.key.includes(q) ? 1 : -1 }))
		.filter((s) => s.rank >= 0)
		.sort((a, b) => a.rank - b.rank || b.t.count - a.t.count || a.t.key.localeCompare(b.t.key))
		.slice(0, limit)
		.map((s) => s.t);
	const typed = hashtagAt(`#${query}`, 0);
	const isNew = typed !== null && typed.name.length === query.normalize('NFC').length;
	const create = isNew && !known.some((t) => t.key === q) ? query : null;
	return { tags, create };
}

/** A row of the `#` list: a tag the household has, or the typed name as a new one, last. */
export type TagRow<T extends KnownTag = KnownTag> =
	{ kind: 'tag'; tag: T } | { kind: 'new'; name: string };

export function tagRows<T extends KnownTag>(suggestions: TagSuggestions<T>): TagRow<T>[] {
	const rows: TagRow<T>[] = suggestions.tags.map((tag) => ({ kind: 'tag', tag }));
	if (suggestions.create) rows.push({ kind: 'new', name: suggestions.create });
	return rows;
}

/** The `#` list as a host holds it: the tag being typed, and which row is highlighted. */
export interface TagListState {
	active: ActiveHashtag | null;
	highlighted: number;
}

export const TAG_LIST_CLOSED: TagListState = { active: null, highlighted: 0 };

/** The list after the caret moved or the text changed: the highlight back on the first row. */
export function followCaret(text: string, caret: number): TagListState {
	return { active: activeHashtag(text, caret), highlighted: 0 };
}

/** The highlight moved by one, round the rows. */
export function moveHighlight(state: TagListState, by: 1 | -1, rows: number): TagListState {
	if (rows === 0) return state;
	return { ...state, highlighted: (state.highlighted + by + rows) % rows };
}

/** The text with the row written in and where the caret goes, or null with nothing to choose. */
export function chooseRow(
	text: string,
	caret: number,
	state: TagListState,
	row: TagRow | undefined
): { text: string; caret: number } | null {
	if (!row || !state.active) return null;
	return insertHashtag(text, state.active, caret, row.kind === 'tag' ? row.tag.name : row.name);
}

/** What a key does while the `#` list is open; null leaves it to the field. */
export function tagListKey(key: string): 'next' | 'previous' | 'choose' | 'close' | null {
	if (key === 'ArrowDown') return 'next';
	if (key === 'ArrowUp') return 'previous';
	if (key === 'Enter' || key === 'Tab') return 'choose';
	if (key === 'Escape') return 'close';
	return null;
}

/** Replace the active tag with `name` plus a trailing space; returns the new text and caret. */
export function insertHashtag(
	text: string,
	active: ActiveHashtag,
	caret: number,
	name: string
): { text: string; caret: number } {
	const inserted = `#${name} `;
	return {
		text: text.slice(0, active.start) + inserted + text.slice(caret),
		caret: active.start + inserted.length
	};
}

/** The tags saving `body` gives the entry, in the spelling the household keeps. */
export function tagsToSave(
	body: string,
	known: readonly KnownTag[]
): { name: string; isNew: boolean }[] {
	const byKey = new Map(known.map((t) => [t.key, t.name]));
	return hashtagsIn(body).map((name) => {
		const kept = byKey.get(tagKey(name));
		return { name: kept ?? name, isNew: kept === undefined };
	});
}
