import { describe, expect, it } from 'bun:test';
import { isStorageFull, mediaToEvict } from './storage-full';

/*
 * The device's storage running out under the kept pages (docs/02 §2.18): which failure that
 * is, and which kept photos make room first.
 */

const ORIGIN = 'https://stella.example';
const at = (path: string, date: string | null) => ({ key: `${ORIGIN}${path}`, date });

describe('isStorageFull', () => {
	it('is the quota error a cache write rejects with', () => {
		expect(isStorageFull(new DOMException('full', 'QuotaExceededError'))).toBe(true);
	});

	it('is not any other failure', () => {
		expect(isStorageFull(new TypeError('Partial response'))).toBe(false);
		expect(isStorageFull(new DOMException('gone', 'NotFoundError'))).toBe(false);
		expect(isStorageFull('QuotaExceededError')).toBe(false);
		expect(isStorageFull(null)).toBe(false);
	});
});

describe('mediaToEvict', () => {
	it('gives up the oldest quarter of the kept photos', () => {
		const kept = [
			at('/media/p1?thumb', 'Wed, 04 Nov 2026 10:00:00 GMT'),
			at('/media/p2?thumb', 'Mon, 02 Nov 2026 10:00:00 GMT'),
			at('/media/p3?view', 'Tue, 03 Nov 2026 10:00:00 GMT'),
			at('/media/p4?thumb', 'Thu, 05 Nov 2026 10:00:00 GMT'),
			at('/media/p5?thumb', 'Sun, 01 Nov 2026 10:00:00 GMT'),
			at('/media/p6?thumb', 'Fri, 06 Nov 2026 10:00:00 GMT'),
			at('/media/p7?thumb', 'Sat, 07 Nov 2026 10:00:00 GMT'),
			at('/media/p8?thumb', 'Sat, 07 Nov 2026 11:00:00 GMT')
		];
		expect(mediaToEvict(kept, ORIGIN)).toEqual([
			`${ORIGIN}/media/p5?thumb`,
			`${ORIGIN}/media/p2?thumb`
		]);
	});

	it('gives up one photo at least', () => {
		expect(mediaToEvict([at('/media/p1?thumb', 'Wed, 04 Nov 2026 10:00:00 GMT')], ORIGIN)).toEqual([
			`${ORIGIN}/media/p1?thumb`
		]);
	});

	it('gives up a photo of unknown age before a dated one', () => {
		const kept = [
			at('/media/p1?thumb', 'Sun, 01 Nov 2026 10:00:00 GMT'),
			at('/media/p2?thumb', null)
		];
		expect(mediaToEvict(kept, ORIGIN)).toEqual([`${ORIGIN}/media/p2?thumb`]);
	});

	it('never gives up a page — those are what the device keeps for reading offline', () => {
		const kept = [
			at('/contacts/c1/__data.json', 'Sun, 01 Nov 2026 10:00:00 GMT'),
			at('/', null),
			{ key: 'https://elsewhere.example/media/p1?thumb', date: null }
		];
		expect(mediaToEvict(kept, ORIGIN)).toEqual([]);
	});
});
