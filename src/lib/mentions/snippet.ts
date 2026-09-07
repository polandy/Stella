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
	const flat = segmentMentions(body)
		.map((segment) =>
			segment.type === 'text'
				? plain(segment.value)
				: `@${nameOf(segment.id) ?? UNKNOWN_MENTION.slice(1)}`
		)
		.join('');
	return truncate(flat.replace(/\s+/g, ' ').trim(), limit);
}
