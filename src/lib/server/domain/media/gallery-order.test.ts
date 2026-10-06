import { describe, expect, it } from 'bun:test';
import { orderGallery } from './gallery-order';

/*
 * The one rule for the order a person's photos are shown in (docs/02 §2.14): favourites
 * first, the most recently pinned leading, then everything else newest first.
 */

const photo = (
	id: string,
	createdAt: number,
	pinnedAt: number | null = null,
	takenAt: string | null = null
) => ({
	id,
	createdAt,
	pinnedAt,
	takenAt
});
const ids = (photos: { id: string }[]) => photos.map((p) => p.id);

describe('orderGallery', () => {
	it('shows unpinned photos newest first', () => {
		expect(ids(orderGallery([photo('old', 1), photo('new', 3), photo('mid', 2)]))).toEqual([
			'new',
			'mid',
			'old'
		]);
	});

	it('dates a photo by when it was taken when its EXIF said so, else by when it was added', () => {
		const added2026 = Date.UTC(2026, 9, 1);
		const ordered = orderGallery([
			photo('scanned-2026-of-1999', added2026, null, '1999-07-14T12:00:00'),
			photo('added-2020', Date.UTC(2020, 0, 1)),
			photo('taken-2024', added2026 + 1, null, '2024-12-24T18:30:00+01:00')
		]);
		expect(ids(ordered)).toEqual(['taken-2024', 'added-2020', 'scanned-2026-of-1999']);
	});

	it('puts pinned photos before every unpinned one, however old they are', () => {
		const ordered = orderGallery([photo('new', 30), photo('baby', 1, 100), photo('mid', 20)]);
		expect(ids(ordered)).toEqual(['baby', 'new', 'mid']);
	});

	it('leads with the photo pinned most recently, whatever its date', () => {
		const ordered = orderGallery([photo('a', 10, 200), photo('b', 30, 100), photo('c', 20, 300)]);
		expect(ids(ordered)).toEqual(['c', 'a', 'b']);
	});

	it('breaks a tie by date, then by id, so the order never depends on the input', () => {
		const tied = [
			photo('x', 5),
			photo('y', 5),
			photo('older', 4),
			photo('p', 1, 9),
			photo('q', 2, 9)
		];
		const expected = ['q', 'p', 'y', 'x', 'older'];
		expect(ids(orderGallery(tied))).toEqual(expected);
		expect(ids(orderGallery([...tied].reverse()))).toEqual(expected);
	});

	it('leaves the list it was given untouched', () => {
		const given = [photo('old', 1), photo('new', 2)];
		orderGallery(given);
		expect(ids(given)).toEqual(['old', 'new']);
	});

	it('keeps an empty gallery empty', () => {
		expect(orderGallery([])).toEqual([]);
	});
});
