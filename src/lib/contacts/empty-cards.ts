import type { ContactSection } from './sections';

/*
 * How a card of the person page stands while it holds nothing (docs/05 §5.5). Most people in a
 * household are reference records, and a page of boxes that each say "nothing" teaches the
 * reader to stop looking — the rule *Coming up* already follows.
 *
 * Pure, so the jump bar can be held to it: a link may only point at a card that is there.
 */

/**
 * - `card`: the full card, header and body.
 * - `line`: one line — the title, one sentence, the card's actions — until its form is opened.
 * - `absent`: not on the page at all.
 */
export type CardShape = 'card' | 'line' | 'absent';

/** What an empty card becomes. People and the story keep their cards: their empty states are
 * where adding starts. *Mentioned in* is passive — there is nothing to add there. */
const SHAPE_WHEN_EMPTY = {
	relationships: 'card',
	photos: 'line',
	story: 'card',
	notes: 'line',
	gifts: 'line',
	mentions: 'absent'
} as const satisfies Record<ContactSection, CardShape>;

/** How `section` stands, given whether it holds anything to show. */
export function cardShape(section: ContactSection, holdsSomething: boolean): CardShape {
	return holdsSomething ? 'card' : SHAPE_WHEN_EMPTY[section];
}
