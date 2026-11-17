import { describe, expect, it } from 'bun:test';
import type { LibraryPhoto } from './library';
import {
	LIBRARY_PICK_LIMIT,
	libraryQueryUrl,
	tickNumber,
	tickTray,
	toggledTick
} from './library-pick';

describe('ticking photos in the library picker', () => {
	it('ticks in the order of the taps, and a second tap unticks', () => {
		const ticked = toggledTick(toggledTick(toggledTick([], 'c'), 'a'), 'b');
		expect(ticked).toEqual(['c', 'a', 'b']);
		expect(toggledTick(ticked, 'a')).toEqual(['c', 'b']);
	});

	it('numbers a tick by its place in the order, and an unticked photo not at all', () => {
		expect(tickNumber(['c', 'a'], 'a')).toBe(2);
		expect(tickNumber(['c', 'a'], 'x')).toBeNull();
	});

	it('takes no more than the limit, but still unticks at the limit', () => {
		const full = Array.from({ length: LIBRARY_PICK_LIMIT }, (_, i) => `p${i}`);
		expect(toggledTick(full, 'one-more')).toBe(full);
		expect(toggledTick(full, 'p3')).toHaveLength(LIBRARY_PICK_LIMIT - 1);
	});
});

describe('the tray of ticked photos', () => {
	const photo = (id: string): LibraryPhoto => ({
		id,
		takenAt: null,
		thumbnailUrl: `/t/${id}`,
		previewUrl: `/p/${id}`
	});

	it('lists the ticks in the order of the taps with their numbers, whichever view they came from', () => {
		const seen = new Map([photo('a'), photo('b'), photo('c')].map((p) => [p.id, p]));
		expect(tickTray(['c', 'a'], seen)).toEqual([
			{ number: 1, photo: photo('c') },
			{ number: 2, photo: photo('a') }
		]);
	});

	it('is empty without ticks and skips a tick whose photo was not seen', () => {
		expect(tickTray([], new Map())).toEqual([]);
		expect(tickTray(['gone'], new Map())).toEqual([]);
	});
});

describe('what the picker asks Stella for', () => {
	it('asks for a day, or for a search', () => {
		expect(libraryQueryUrl({ day: '2026-10-26' })).toBe('/immich/library?day=2026-10-26');
		expect(libraryQueryUrl({ query: 'pumpkin & cake' })).toBe('/immich/library?q=pumpkin+%26+cake');
		expect(libraryQueryUrl({ month: '2026-10', cursor: null })).toBe(
			'/immich/library?month=2026-10'
		);
		expect(libraryQueryUrl({ month: '2026-10', cursor: 'a/b=' })).toBe(
			'/immich/library?month=2026-10&cursor=a%2Fb%3D'
		);
	});
});
