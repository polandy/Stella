import { describe, expect, test } from 'bun:test';
import { datedAt, isPlausibleTakenAt, isTakenAt, photoDay, takenAtMs } from './taken-at';

/*
 * A photo's capture date (docs/02 §2.14, docs/03 §photo): the wall-clock time the camera wrote,
 * with its offset when the camera wrote one. The same rules on the phone and on the server.
 */

const NOW = Date.UTC(2026, 9, 4, 12, 0, 0);
const HOUR = 3_600_000;

describe('isTakenAt', () => {
	test('accepts a wall-clock time, with or without an offset', () => {
		for (const value of [
			'2019-05-03T00:30:15',
			'2019-05-03T00:30:15+02:00',
			'2019-05-03T00:30:15-09:30',
			'2019-05-03T00:30:15Z'
		]) {
			expect(isTakenAt(value)).toBe(true);
		}
	});

	test('refuses another shape, a day that does not exist, or an offset no zone has', () => {
		for (const value of [
			'',
			'2019-05-03',
			'2019-05-03 00:30:15',
			'2019:05:03 00:30:15',
			'2019-05-03T00:30:15.123Z',
			'2019-02-29T10:00:00',
			'2019-04-31T10:00:00',
			'2019-00-10T10:00:00',
			'2019-05-03T24:00:00',
			'2019-05-03T10:60:00',
			'2019-05-03T10:00:60',
			'2019-05-03T10:00:00+15:00',
			'2019-05-03T10:00:00+02:60',
			' 2019-05-03T10:00:00'
		]) {
			expect(isTakenAt(value)).toBe(false);
		}
		expect(isTakenAt('2020-02-29T10:00:00')).toBe(true);
	});
});

describe('takenAtMs', () => {
	test('an offset places the moment exactly', () => {
		expect(takenAtMs('2019-05-03T00:30:15+02:00')).toBe(Date.UTC(2019, 4, 2, 22, 30, 15));
		expect(takenAtMs('2019-05-03T00:30:15Z')).toBe(Date.UTC(2019, 4, 3, 0, 30, 15));
	});

	test('without one the wall-clock time is read as UTC, the same everywhere it is read', () => {
		expect(takenAtMs('2019-05-03T00:30:15')).toBe(Date.UTC(2019, 4, 3, 0, 30, 15));
	});
});

describe('isPlausibleTakenAt', () => {
	test('any time from the first photograph up to now', () => {
		expect(isPlausibleTakenAt('1826-01-01T00:00:00', NOW)).toBe(true);
		expect(isPlausibleTakenAt('2026-10-04T12:00:00Z', NOW)).toBe(true);
	});

	test('a day of slack for clocks and for a time without offset', () => {
		expect(isPlausibleTakenAt('2026-10-05T11:59:59Z', NOW)).toBe(true);
		expect(isPlausibleTakenAt('2026-10-05T12:00:01Z', NOW)).toBe(false);
	});

	test('nothing before photography existed', () => {
		expect(isPlausibleTakenAt('1825-12-31T23:59:59', NOW)).toBe(false);
	});
});

describe('datedAt', () => {
	test('the capture moment when known, else when it was added', () => {
		expect(datedAt({ takenAt: '2019-05-03T00:30:15Z', createdAt: NOW })).toBe(
			Date.UTC(2019, 4, 3, 0, 30, 15)
		);
		expect(datedAt({ takenAt: null, createdAt: NOW })).toBe(NOW);
	});
});

describe('photoDay', () => {
	test('the camera’s own calendar day, whatever zone reads it', () => {
		// 00:30 in Berlin is the evening before in UTC; the photo was still taken on the 3rd.
		expect(photoDay({ takenAt: '2019-05-03T00:30:15+02:00', createdAt: NOW })).toBe('2019-05-03');
	});

	test('the day it was added when the capture date is unknown', () => {
		expect(photoDay({ takenAt: null, createdAt: NOW + HOUR })).toBe(
			new Date(NOW + HOUR).toISOString()
		);
	});
});
