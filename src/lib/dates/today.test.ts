import { describe, expect, it } from 'bun:test';
import { todayFor, writersDay } from './today';

/*
 * "Today" is the server's calendar day, read off the injected clock. The instants are built
 * with the local-time Date constructor, so each case means the same wall-clock moment in
 * whatever `TZ` the run is pinned to (docs/08 §8.4.2) — the assertion never depends on it.
 */

const at = (...parts: [number, number, number, number, number]) => ({
	now: () => new Date(...parts).getTime()
});

describe('todayFor', () => {
	it('names the clock’s calendar day as YYYY-MM-DD', () => {
		expect(todayFor(at(2026, 9, 7, 12, 0))).toBe('2026-10-07');
	});

	it('pads a single-digit month and day', () => {
		expect(todayFor(at(2026, 0, 5, 12, 0))).toBe('2026-01-05');
	});

	it('keeps the day until the last minute before local midnight', () => {
		expect(todayFor(at(2026, 11, 31, 23, 59))).toBe('2026-12-31');
	});

	it('turns over at local midnight, not at UTC midnight', () => {
		expect(todayFor(at(2027, 0, 1, 0, 0))).toBe('2027-01-01');
	});
});

describe('writersDay', () => {
	it('is the rendered day where there is no device', () => {
		expect(writersDay('2026-10-08', null)).toBe('2026-10-08');
	});

	it('moves forward to the device’s day on a page kept for days', () => {
		expect(writersDay('2026-10-08', '2026-10-10')).toBe('2026-10-10');
	});

	it('never moves back to a device that is behind', () => {
		expect(writersDay('2026-10-08', '2026-10-07')).toBe('2026-10-08');
	});
});
