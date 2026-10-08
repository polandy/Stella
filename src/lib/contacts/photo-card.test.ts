import { describe, expect, it } from 'bun:test';
import { glanceTiles, mixPhotos, photoKey, photoTabs } from './photo-card';

/*
 * The person page's Photos card (docs/02 §2.14, §2.24.3): what *All* shows — the gallery and
 * the latest Immich photos in one list — and how much of it fits the card's first row.
 */

const stella = (id: string, takenAt: string | null, pinnedAt: number | null = null) => ({
	id,
	takenAt,
	createdAt: Date.UTC(2020, 0, 1),
	pinnedAt
});
const immich = (id: string, takenOn: string | null) => ({ id, takenOn });
const ids = (photos: readonly { source: string; photo: { id: string } }[]) =>
	photos.map((entry) => `${entry.source}:${entry.photo.id}`);

describe('mixPhotos', () => {
	it('puts the household’s favourites first, in the order the gallery has them', () => {
		const mixed = mixPhotos({
			stella: [stella('fav-b', '2001-01-01T00:00:00', 2), stella('fav-a', null, 1)],
			immich: [immich('i1', '2026-08-01')],
			immichComplete: true
		});
		expect(ids(mixed)).toEqual(['stella:fav-b', 'stella:fav-a', 'immich:i1']);
	});

	it('merges the rest newest first, by when each was taken', () => {
		const mixed = mixPhotos({
			stella: [stella('s-2024', '2024-05-01T10:00:00'), stella('s-2019', '2019-01-01T08:00:00')],
			immich: [immich('i-2026', '2026-08-01'), immich('i-2020', '2020-03-03')],
			immichComplete: true
		});
		expect(ids(mixed)).toEqual([
			'immich:i-2026',
			'stella:s-2024',
			'immich:i-2020',
			'stella:s-2019'
		]);
	});

	it('dates a Stella photo without a capture date by when it was added', () => {
		const added = { id: 'added', takenAt: null, createdAt: Date.UTC(2025, 5, 1), pinnedAt: null };
		const mixed = mixPhotos({
			stella: [added],
			immich: [immich('i-2026', '2026-01-01'), immich('i-2024', '2024-01-01')],
			immichComplete: true
		});
		expect(ids(mixed)).toEqual(['immich:i-2026', 'stella:added', 'immich:i-2024']);
	});

	it('shows a Stella photo before an Immich one taken the same day', () => {
		const mixed = mixPhotos({
			stella: [stella('s', '2024-05-01T00:00:00')],
			immich: [immich('i', '2024-05-01')],
			immichComplete: true
		});
		expect(ids(mixed)).toEqual(['stella:s', 'immich:i']);
	});

	it('keeps an undated Immich photo where Immich put it, after the one before it', () => {
		const mixed = mixPhotos({
			stella: [stella('s-2025', '2025-01-01T00:00:00')],
			immich: [
				immich('i-2026', '2026-01-01'),
				immich('undated', null),
				immich('i-2024', '2024-01-01')
			],
			immichComplete: true
		});
		expect(ids(mixed)).toEqual([
			'immich:i-2026',
			'immich:undated',
			'stella:s-2025',
			'immich:i-2024'
		]);
	});

	it('holds back a Stella photo older than every Immich photo loaded while Immich has more', () => {
		const mixed = mixPhotos({
			stella: [stella('s-2025', '2025-01-01T00:00:00'), stella('s-2010', '2010-01-01T00:00:00')],
			immich: [immich('i-2026', '2026-01-01'), immich('i-2020', '2020-01-01')],
			immichComplete: false
		});
		// The 2010 photo comes once *Show more* has reached its year, below what is shown now.
		expect(ids(mixed)).toEqual(['immich:i-2026', 'stella:s-2025', 'immich:i-2020']);
	});

	it('holds back nothing once Immich has no more, or never had any', () => {
		const mixed = mixPhotos({
			stella: [stella('s-2010', '2010-01-01T00:00:00')],
			immich: [],
			immichComplete: true
		});
		expect(ids(mixed)).toEqual(['stella:s-2010']);
	});

	it('keeps the favourites even while Immich is still on its way', () => {
		const mixed = mixPhotos({
			stella: [stella('fav', '2000-01-01T00:00:00', 1), stella('s', '2024-01-01T00:00:00')],
			immich: [],
			immichComplete: false
		});
		expect(ids(mixed)).toEqual(['stella:fav']);
	});
});

describe('glanceTiles', () => {
	it('shows every photo when they fit two phone rows of three', () => {
		expect(glanceTiles(6)).toEqual({ wide: 6, narrow: 6, moreWide: false, moreNarrow: false });
		expect(glanceTiles(2)).toEqual({ wide: 2, narrow: 2, moreWide: false, moreNarrow: false });
	});

	it('fills the desktop row of seven, while the phone gives its sixth tile to *All*', () => {
		expect(glanceTiles(7)).toEqual({ wide: 7, narrow: 5, moreWide: false, moreNarrow: true });
	});

	it('gives the last tile to *All* at either width once there are more', () => {
		expect(glanceTiles(1769)).toEqual({ wide: 6, narrow: 5, moreWide: true, moreNarrow: true });
	});

	it('has nothing to show for no photo', () => {
		expect(glanceTiles(0)).toEqual({ wide: 0, narrow: 0, moreWide: false, moreNarrow: false });
	});
});

describe('photoTabs', () => {
	it('offers Immich only once Immich has answered for a linked person', () => {
		expect(photoTabs({ immichAnswered: false })).toEqual(['all', 'stella']);
		expect(photoTabs({ immichAnswered: true })).toEqual(['all', 'stella', 'immich']);
	});
});

describe('photoKey', () => {
	it('names a photo by its source, so the same id from both never collides', () => {
		expect(photoKey({ source: 'stella', photo: { id: 'x' } })).not.toBe(
			photoKey({ source: 'immich', photo: { id: 'x' } })
		);
	});
});
