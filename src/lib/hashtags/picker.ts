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
