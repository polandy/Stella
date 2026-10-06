import { describe, expect, it } from 'bun:test';
import { todayFor } from './today';

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
