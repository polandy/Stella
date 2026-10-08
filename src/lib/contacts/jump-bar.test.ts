import { describe, expect, it } from 'bun:test';
import {
	barVisible,
	currentSection,
	JUMP_SECTIONS,
	jumpEntries,
	markedSection,
	scrollsThePage
} from './jump-bar';
import { cardShape } from './empty-cards';

/*
 * The person page's jump bar (docs/05 §5.5): one link per card worth jumping to, with the
 * card's own count, and the card being read marked as current.
 */

describe('jumpEntries', () => {
	it('links People, Photos, Story, Notes and Gifts in the page’s order', () => {
		const entries = jumpEntries({ relationships: 10, photos: 23, notes: 2 });
		expect(entries.map((e) => e.section)).toEqual([...JUMP_SECTIONS]);
		expect(entries.map((e) => e.section)).toEqual([
			'relationships',
			'photos',
			'story',
			'notes',
			'gifts'
		]);
	});

	it('carries each card’s count, but none for the story, which is paged, or the gifts', () => {
		// The Gifts card counts its open ideas on its tab, not in its header (docs/02 §2.25).
		expect(jumpEntries({ relationships: 10, photos: 23, notes: 2 }).map((e) => e.count)).toEqual([
			10,
			23,
			null,
			2,
			null
		]);
	});

	it('drops a count of nothing: “Photos 0” only takes room', () => {
		expect(jumpEntries({ relationships: 0, photos: 0, notes: 0 }).map((e) => e.count)).toEqual([
			null,
			null,
			null,
			null,
			null
		]);
	});
});

describe('currentSection', () => {
	/**
	 * Tops measured from the top of the visible page, as the layout hands them over; a card a
	 * case leaves out stands far below, as the Gifts card does under a long story.
	 */
	const cards = (tops: Record<string, number>) =>
		JUMP_SECTIONS.map((section) => ({ section, top: tops[section] ?? 5000 }));
	const view = { line: 60, height: 800, atBottom: false };

	it('marks nothing while the reader is still above the first card', () => {
		expect(
			currentSection(cards({ relationships: 300, photos: 900, story: 1400, notes: 1900 }), view)
		).toBeNull();
	});

	it('marks the last card whose top has passed under the bar', () => {
		expect(
			currentSection(cards({ relationships: 60, photos: 500, story: 1000, notes: 1500 }), view)
		).toBe('relationships');
		expect(
			currentSection(cards({ relationships: -600, photos: 40, story: 600, notes: 1100 }), view)
		).toBe('photos');
	});

	it('marks the story while story and notes stand side by side', () => {
		expect(
			currentSection(cards({ relationships: -900, photos: -400, story: 20, notes: 20 }), view)
		).toBe('story');
	});

	it('marks the last card on screen once the page cannot scroll any further', () => {
		// The notes never reach the bar on a short page; at the bottom they are what is left to read.
		const bottom = { ...view, atBottom: true };
		expect(
			currentSection(cards({ relationships: -900, photos: -400, story: 20, notes: 20 }), bottom)
		).toBe('notes');
		expect(
			currentSection(cards({ relationships: -900, photos: -400, story: 100, notes: 700 }), bottom)
		).toBe('notes');
		// A card still below the screen is not one being read, bottom or not.
		expect(
			currentSection(cards({ relationships: -900, photos: 200, story: 900, notes: 1400 }), bottom)
		).toBe('photos');
	});
});

describe('markedSection', () => {
	it('marks the card being read when nothing was tapped', () => {
		expect(markedSection('photos', null)).toBe('photos');
		expect(markedSection(null, null)).toBeNull();
	});

	it('marks the tapped card throughout the glide and after it, whatever passes under the bar', () => {
		// On the way down Photos passes under the bar; the mark stays on the card asked for.
		expect(markedSection('photos', 'notes')).toBe('notes');
		// Notes beside Activity shares its top, and the page cannot scroll Notes any higher.
		expect(markedSection('story', 'notes')).toBe('notes');
		expect(markedSection(null, 'relationships')).toBe('relationships');
	});
});

describe('scrollsThePage', () => {
	it('names the keys that move the page, which let go of a tapped card', () => {
		for (const key of ['PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End', ' '])
			expect(scrollsThePage(key)).toBe(true);
	});

	it('leaves the keys that only move the cursor, so Tab into the card keeps its mark', () => {
		for (const key of ['Tab', 'Enter', 'a', 'Escape']) expect(scrollsThePage(key)).toBe(false);
	});
});

describe('barVisible', () => {
	const BAR = 49;

	it('stays away while the identity card still shows below the bar', () => {
		expect(barVisible({ cardBottom: 640, barHeight: BAR })).toBe(false);
		expect(barVisible({ cardBottom: BAR + 1, barHeight: BAR })).toBe(false);
	});

	it('shows once the identity card’s bottom has passed under the bar’s foot', () => {
		expect(barVisible({ cardBottom: BAR, barHeight: BAR })).toBe(true);
		expect(barVisible({ cardBottom: -900, barHeight: BAR })).toBe(true);
	});

	it('shows where a jump to People leaves the page: that card just below the bar', () => {
		// The page's gap is 20 px, so the identity card's foot stands 20 px above People's top.
		expect(barVisible({ cardBottom: BAR - 20, barHeight: BAR })).toBe(true);
	});

	it('follows the bar’s height when its links wrap onto a second row', () => {
		expect(barVisible({ cardBottom: 80, barHeight: BAR })).toBe(false);
		expect(barVisible({ cardBottom: 80, barHeight: 2 * BAR })).toBe(true);
	});
});

describe('the cards the bar links', () => {
	it('stand on the page even when they hold nothing, so no link points at a missing card', () => {
		for (const section of JUMP_SECTIONS) expect(cardShape(section, false)).not.toBe('absent');
	});
});
