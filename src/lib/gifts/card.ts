/*
 * How the person page's Gifts card stands (docs/dev/02 §2.25, docs/dev/05 §5.5). Pure, so which tabs
 * it shows and how its lists are divided are tested without a browser; the card only renders.
 */

import type { PartialDate } from '../dates/partial-date';
import { whenDay } from '../when/resolve';
import { ideaWaits, type IdeaTiming } from './idea-when';

/** The open ideas, and the ones waiting under *Later* — soonest first, *later* last (§2.25.8). */
export function splitIdeas<T extends IdeaTiming>(
	ideas: readonly T[],
	birth: PartialDate | null,
	today: string
): { open: T[]; waiting: T[] } {
	const open: T[] = [];
	const waiting: T[] = [];
	for (const idea of ideas) (ideaWaits(idea, birth, today) ? waiting : open).push(idea);
	// '~' sorts after every ISO day by code point, so *later* comes last.
	const dueOf = (idea: T) => (idea.when ? (whenDay(idea.when, birth)?.on ?? '~') : '~');
	waiting.sort((a, b) => (dueOf(a) < dueOf(b) ? -1 : dueOf(a) > dueOf(b) ? 1 : 0));
	return { open, waiting };
}

/** The card's tabs: open ideas, what was given, what was received, what the person gives others. */
export type GiftTab = 'ideas' | 'given' | 'received' | 'gives';

/** One tab and the count its label carries, if any. */
export interface GiftTabEntry {
	tab: GiftTab;
	/** *Ideas* and *Gives* count what is still open; a zero says nothing and is left off. */
	count: number | null;
}

/**
 * The tabs to show. *Received* stays away until something was received: most people never
 * give the household a present anyone notes down, and an empty third tab only takes room.
 * *Gives* is on every person, children too, for it carries *+ Tomy gives…* (§2.25.12).
 */
export function giftTabs(counts: {
	ideas: number;
	given: number;
	received: number;
	gives: number;
}): GiftTabEntry[] {
	const tabs: GiftTabEntry[] = [
		{ tab: 'ideas', count: counts.ideas > 0 ? counts.ideas : null },
		{ tab: 'given', count: null }
	];
	if (counts.received > 0) tabs.push({ tab: 'received', count: null });
	tabs.push({ tab: 'gives', count: counts.gives > 0 ? counts.gives : null });
	return tabs;
}

/** What a person gives others: still to give first, then *Earlier* — the order the server sent. */
export function splitGives<T extends { state: string }>(
	gives: readonly T[]
): { open: T[]; earlier: T[] } {
	const open: T[] = [];
	const earlier: T[] = [];
	for (const gift of gives) (gift.state === 'given' ? earlier : open).push(gift);
	return { open, earlier };
}

/** The gifts of one year, under its divider. */
export interface GiftYear<T> {
	year: string;
	gifts: T[];
}

/**
 * Split an already-ordered list into consecutive years, one divider each — *2025 · Birthday ·
 * Teapot*. Consecutive rather than keyed, like the story's days: the order is the server's.
 */
export function byYear<T extends { givenOn: string | null }>(gifts: readonly T[]): GiftYear<T>[] {
	const years: GiftYear<T>[] = [];
	for (const gift of gifts) {
		// A given or received gift always has its day; an idea, which has none, is never listed here.
		const year = gift.givenOn?.slice(0, 4) ?? '';
		const current = years.at(-1);
		if (current === undefined || current.year !== year) years.push({ year, gifts: [gift] });
		else current.gifts.push(gift);
	}
	return years;
}

const GIFT_PARAM = 'gift';

/**
 * Where the command palette's *Gift idea for …* lands (docs/dev/05 §5.4): the person's page, its
 * Gifts card's idea form open. No `#section-gifts`: after a client navigation SvelteKit focuses
 * the hash's target, which would take the cursor back out of the form; opening the form scrolls
 * it into view anyway.
 */
export function giftIdeaPath(contactId: string): string {
	return `/contacts/${contactId}?${GIFT_PARAM}=idea`;
}

/** Whether a page address asks for the idea form (`giftIdeaPath`). */
export function asksForGiftIdea(url: URL): boolean {
	return url.searchParams.get(GIFT_PARAM) === 'idea';
}
