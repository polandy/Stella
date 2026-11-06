import { describe, expect, it } from 'bun:test';
import { cameraDayOf, cameraDaysWindow } from './camera-day';

/*
 * Days on the camera's clock (docs/02 §2.24.9). Immich filters on the instant, so a day is asked
 * for as wide as the world's offsets reach, and each photo's day is read off its own clock.
 */

describe('cameraDaysWindow', () => {
	it('widens one day by UTC+14 before it and UTC−12 after it, and a little more', () => {
		expect(cameraDaysWindow('2026-07-11', '2026-07-11')).toEqual({
			from: '2026-07-10T10:00:00.000Z',
			before: '2026-07-12T14:00:00.000Z'
		});
	});

	it('spans every day from the first to the last, both included', () => {
		expect(cameraDaysWindow('2026-12-31', '2027-01-02')).toEqual({
			from: '2026-12-30T10:00:00.000Z',
			before: '2027-01-03T14:00:00.000Z'
		});
	});
});

describe('cameraDayOf', () => {
	it('is the day on the clock the photo was taken by, whatever its offset', () => {
		expect(cameraDayOf({ id: 'a', takenAt: '2026-07-11T23:30:00+02:00' })).toBe('2026-07-11');
		expect(cameraDayOf({ id: 'a', takenAt: '2026-07-11T00:10:00' })).toBe('2026-07-11');
	});

	it('is null when Immich does not say when it was taken', () => {
		expect(cameraDayOf({ id: 'a', takenAt: null })).toBeNull();
	});
});
