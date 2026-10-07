import type { ContactSection } from './sections';

/*
 * The person page's jump bar (docs/05 §5.5): under the identity card, sticking under the top
 * bar once that card has gone by, one link per card worth jumping to — People, Photos, Story,
 * Notes — and the card being read marked. *Mentioned in* is left out: it is the page's quiet
 * foot, reached by scrolling on, and a fifth link does not fit a phone's width.
 *
 * Pure, so what the bar says and which card it marks are tested without a browser; the page
 * only measures where the cards stand.
 */

/** The cards the bar links, in the page's order. */
export const JUMP_SECTIONS = [
	'relationships',
	'photos',
	'story',
	'notes'
] as const satisfies readonly ContactSection[];
export type JumpSection = (typeof JUMP_SECTIONS)[number];

/** The counts the cards carry in their own headers. The story is paged and has none. */
export interface JumpCounts {
	relationships: number;
	photos: number;
	notes: number;
}

/** One link of the bar: the card, and its count where it has one worth saying. */
export interface JumpEntry {
	section: JumpSection;
	count: number | null;
}

/** What the bar shows. A count of nothing is left off: "Photos 0" only takes room. */
export function jumpEntries(counts: JumpCounts): JumpEntry[] {
	return JUMP_SECTIONS.map((section) => {
		const count = section === 'story' ? null : counts[section];
		return { section, count: count ? count : null };
	});
}

/** Where a card's top stands, in pixels from the top of the visible page. */
export interface CardTop {
	section: JumpSection;
	top: number;
}

/** The visible page, as far as the decision needs it. */
export interface JumpView {
	/** How far below the visible top a card counts as being read: the bar's foot, about. */
	line: number;
	/** The visible page's height. */
	height: number;
	/** Whether the page is scrolled as far down as it goes. */
	atBottom: boolean;
}

/**
 * The card being read: the one whose top passed under the bar last. Cards standing side by
 * side (story and notes on a wide screen) share a top, and the first of them wins. Nothing is
 * marked while the reader is still above the first card.
 *
 * At the foot of the page a short card may never reach the bar — there is nothing more to
 * scroll — so there the last card showing on screen is marked: it is what is left to read.
 */
export function currentSection(cards: readonly CardTop[], view: JumpView): JumpSection | null {
	if (view.atBottom) {
		const onScreen = cards.filter((card) => card.top < view.height);
		if (onScreen.length > 0) return onScreen[onScreen.length - 1].section;
	}
	let current: CardTop | null = null;
	for (const card of cards) {
		if (card.top > view.line) continue;
		if (current === null || card.top > current.top) current = card;
	}
	return current?.section ?? null;
}

/**
 * The card the bar marks. A tapped link marks its card from the tap on — through the glide,
 * while other cards pass under the bar, and after it, where a card beside another or at the
 * foot of the page never becomes the one `currentSection` reads — until the reader scrolls on
 * their own, which the page reports by letting go of `tapped`.
 */
export function markedSection(
	measured: JumpSection | null,
	tapped: JumpSection | null
): JumpSection | null {
	return tapped ?? measured;
}

/** Where the bar stands against the identity card, as far as showing it needs. */
export interface BarPlace {
	/** The identity card's bottom, in pixels from the top of the visible page. */
	cardBottom: number;
	/** The card a link of the bar was tapped for, until the reader scrolls on their own. */
	tapped: JumpSection | null;
}

/**
 * Whether the bar shows (docs/05 §5.5). At rest nothing stands between the identity card and
 * the People card: the bar shows only once it sticks, which is when the card's bottom has
 * passed the top of the visible page. A tapped link keeps it — a jump to People stops below
 * the bar's own height, which leaves the identity card's foot in view, and a bar that vanished
 * under the finger that used it would read as a fault.
 */
export function barVisible(place: BarPlace): boolean {
	return place.tapped !== null || place.cardBottom <= 0;
}

/** Whether `key` (a `KeyboardEvent.key`) scrolls the page — the reader moving on by keyboard. */
export function scrollsThePage(key: string): boolean {
	return SCROLL_KEYS.has(key);
}

const SCROLL_KEYS = new Set(['PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End', ' ']);
