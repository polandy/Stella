import { describe, expect, it } from 'bun:test';
import { currentSection, JUMP_SECTIONS, jumpEntries } from './jump-bar';

/*
 * The person page's jump bar (docs/05 §5.5): one link per card worth jumping to, with the
 * card's own count, and the card being read marked as current.
 */

describe('jumpEntries', () => {
	it('links People, Photos, Story and Notes in the page’s order', () => {
		const entries = jumpEntries({ relationships: 10, photos: 23, notes: 2 });
		expect(entries.map((e) => e.section)).toEqual([...JUMP_SECTIONS]);
		expect(entries.map((e) => e.section)).toEqual(['relationships', 'photos', 'story', 'notes']);
	});

	it('carries each card’s count, but none for the story, which is paged', () => {
		expect(jumpEntries({ relationships: 10, photos: 23, notes: 2 }).map((e) => e.count)).toEqual([
			10,
			23,
			null,
			2
		]);
	});

	it('drops a count of nothing: “Photos 0” only takes room', () => {
		expect(jumpEntries({ relationships: 0, photos: 0, notes: 0 }).map((e) => e.count)).toEqual([
			null,
			null,
			null,
			null
		]);
	});
});

describe('currentSection', () => {
	/** Tops measured from the top of the visible page, as the layout hands them over. */
	const cards = (tops: Record<string, number>) =>
		JUMP_SECTIONS.map((section) => ({ section, top: tops[section] }));
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
