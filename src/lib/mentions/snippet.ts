import { segmentMentions } from './mentions';

/*
 * The one-line preview of a body, for the places that list an entry rather than render it
 * (docs/02 §2.20.1). Shared rather than server-only: it is plain string work over the same
 * token grammar the picker and the chip already use.
 */

/** How much of a body a passive reference shows before it is cut. */
export const SNIPPET_LENGTH = 140;

/** What a mention of someone the viewer may not see reads as — the marker the chip uses too. */
const UNKNOWN_MENTION = '@unknown';

/** Markdown that carries nothing once the body is one line of plain text. */
const IMAGE = /!\[[^\]]*\]\([^)]*\)/g;
const LINK = /\[([^\]]*)\]\([^)]*\)/g;
const MARKS = /[*_`~#>]/g;

/** One text segment, stripped of the syntax that only means something to the renderer. */
function plain(text: string): string {
	return text.replace(IMAGE, '').replace(LINK, '$1').replace(MARKS, '');
}

/** Cut at the last word boundary before `limit`, so a preview never ends mid-word. */
function truncate(text: string, limit: number): string {
	if (text.length <= limit) return text;
	const cut = text.slice(0, limit);
	const lastSpace = cut.lastIndexOf(' ');
	return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

/**
 * A body as one short line of plain text, with its @-mention tokens read as the people's
 * current names. `nameOf` is scoped to what the viewer may see; an id it does not know reads
 * as a neutral marker, so a hidden person's name never arrives through a preview.
 */
export function mentionSnippet(
	body: string,
	nameOf: (id: string) => string | null,
	limit = SNIPPET_LENGTH
): string {
	return truncate(flatten(body, nameOf), limit);
}

/** A body as one line of plain text, its mentions named — uncut. */
function flatten(body: string, nameOf: (id: string) => string | null): string {
	return segmentMentions(body)
		.map((segment) =>
			segment.type === 'text'
				? plain(segment.value)
				: `@${nameOf(segment.id) ?? UNKNOWN_MENTION.slice(1)}`
		)
		.join('')
		.replace(/\s+/g, ' ')
		.trim();
}

/** How much a cut search snippet shows before the word it was found by, and after it at least. */
const MATCH_LEAD = 30;

/**
 * One character lowercased and stripped of its accents, the way the FTS index folds a word —
 * kept to one character, so an index into the folded text is an index into the original.
 */
function foldChar(ch: string): string {
	const folded = ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
	return folded.length === 1 ? folded : ch;
}

/** Where the first word starting with one of `words` begins in `text`, or -1. */
function firstMatch(text: string, words: readonly string[]): number {
	const folded = Array.from(text, foldChar).join('');
	let best = -1;
	for (const word of words) {
		const re = new RegExp(`(?<![\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u');
		const at = folded.search(re);
		if (at >= 0 && (best < 0 || at < best)) best = at;
	}
	return best;
}

/**
 * A search hit's body as one line, cut around the first word the query found (docs/02 §2.9).
 * Built here rather than by the index, so a mention reads as the person's name exactly as the
 * chip does — the index only knows the name sits somewhere in the entry. `nameOf` is scoped to
 * the viewer, as for {@link mentionSnippet}; a body matched only by its title shows its start.
 */
export function matchSnippet(
	body: string,
	nameOf: (id: string) => string | null,
	query: string,
	limit = SNIPPET_LENGTH
): string {
	const flat = flatten(body, nameOf);
	const words = Array.from(query.match(/[\p{L}\p{N}]+/gu) ?? [], (w) =>
		Array.from(w, foldChar).join('')
	);
	const at = firstMatch(flat, words);
	if (at < limit - MATCH_LEAD) return truncate(flat, limit);
	const start = flat.lastIndexOf(' ', at - MATCH_LEAD) + 1;
	return `…${truncate(flat.slice(start), limit)}`;
}
