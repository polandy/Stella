import { describe, expect, it } from 'bun:test';
import type { ImmichMemoryPhoto, ImmichMemoryYear } from '$lib/immich/on-this-day';
import { immichStrip, memoryCardsWithImmich } from './immich';
import type { MemoryYearView } from './view';

/*
 * Immich's photos of the day beside Stella's own (docs/02 §2.12.1): the gallery's come first, then
 * Immich's, newest year first — on Home's one row, and in the page's year cards.
 */

const photo = (year: number, n: number): ImmichMemoryPhoto => ({
	id: `${year}-${n}`,
	year,
	takenAt: `${year}-11-02T10:0${n}:00`,
	thumbnailUrl: `/t/${year}-${n}`,
	previewUrl: `/p/${year}-${n}`,
	openUrl: `https://immich.example.test/photos/${year}-${n}`
});

const year = (y: number, shown: number, total = shown): ImmichMemoryYear => ({
	year: y,
	photos: Array.from({ length: shown }, (_, n) => photo(y, n)),
	total
});

const ids = (photos: readonly ImmichMemoryPhoto[]) => photos.map((p) => p.id);

describe('immichStrip', () => {
	it('fills what the gallery leaves of the row, newest year first', () => {
		const strip = immichStrip(1, [year(2025, 2), year(2022, 3)]);
		expect(ids(strip.photos)).toEqual(['2025-0', '2025-1', '2022-0']);
		expect(strip.more).toBe(true);
	});

	it('has no More while every photo fits', () => {
		expect(immichStrip(1, [year(2025, 3)]).more).toBe(false);
		expect(immichStrip(0, []).more).toBe(false);
	});

	it('counts the photos not yet loaded towards More', () => {
		const strip = immichStrip(0, [year(2025, 2, 40)]);
		expect([ids(strip.photos), strip.more]).toEqual([['2025-0', '2025-1'], true]);
	});

	it('shows none when the gallery fills the row, and still says there is more', () => {
		expect(immichStrip(4, [year(2025, 1)])).toEqual({ photos: [], more: true });
	});
});

const card = (y: number, yearsAgo: number): MemoryYearView => ({
	year: y,
	yearsAgo,
	rows: [],
	photos: []
});

describe('memoryCardsWithImmich', () => {
	it('hangs each Immich year on its card, and gives a year only Immich has a card of its own', () => {
		const cards = memoryCardsWithImmich(
			[card(2025, 1), card(2021, 5)],
			[year(2024, 2), year(2021, 1)],
			'2026-11-02'
		);
		expect(cards.map((c) => [c.year, c.yearsAgo, c.immich?.photos.length ?? 0])).toEqual([
			[2025, 1, 0],
			[2024, 2, 2],
			[2021, 5, 1]
		]);
	});

	it('leaves the cards as they are without Immich', () => {
		expect(memoryCardsWithImmich([card(2025, 1)], [], '2026-11-02')).toEqual([
			{ ...card(2025, 1), immich: null }
		]);
	});
});
