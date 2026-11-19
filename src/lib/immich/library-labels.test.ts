import { describe, expect, it } from 'bun:test';
import {
	albumRange,
	crumbLabel,
	dayHeading,
	longDay,
	monthAndYear,
	monthName,
	shortDate
} from './library-labels';

const top = { overview: true, allYears: 'All years', allAlbums: 'All albums' };

describe('the picker’s labels', () => {
	it('names days and months in the reader’s language', () => {
		expect(longDay('2026-10-21', 'en-GB')).toBe('Wednesday, 21 October 2026');
		expect(dayHeading('2026-10-21', 'en-GB')).toBe('Wednesday 21 October');
		expect(dayHeading('2026-10-21', 'de-DE')).toBe('Mittwoch, 21. Oktober');
		expect(monthName('2026-10', 'de-DE')).toBe('Oktober');
		expect(monthAndYear('2026-10', 'de-DE')).toBe('Oktober 2026');
		expect(shortDate('2026-10-21T23:30:00', 'en-GB')).toBe('21 Oct 2026');
	});

	it('keeps a date on the camera’s clock, whatever the device’s zone', () => {
		expect(shortDate('2026-10-21T23:59:00Z', 'en-GB')).toBe('21 Oct 2026');
		expect(monthName('2026-01', 'en-GB')).toBe('January');
	});

	it('says each crumb of the trail, the month with its year when it is the top', () => {
		expect(crumbLabel({ level: 'years' }, 'en-GB', top)).toBe('All years');
		expect(crumbLabel({ level: 'year', year: '2026' }, 'en-GB', top)).toBe('2026');
		expect(crumbLabel({ level: 'month', month: '2026-10' }, 'de-DE', top)).toBe('Oktober');
		expect(crumbLabel({ level: 'day', day: '2026-10-21' }, 'de-DE', top)).toBe('Mi., 21.');
		expect(
			crumbLabel({ level: 'month', month: '2026-10' }, 'en-GB', { ...top, overview: false })
		).toBe('October 2026');
		expect(crumbLabel({ level: 'albums' }, 'en-GB', top)).toBe('All albums');
		expect(crumbLabel({ level: 'album', album: 'a1', name: 'Holidays' }, 'en-GB', top)).toBe(
			'Holidays'
		);
	});

	it('says an album’s span as briefly as its days allow', () => {
		expect(albumRange('2026-07-03', '2026-07-28', 'en-GB')).toBe('Jul 2026');
		expect(albumRange('2025-02-14', '2025-03-01', 'en-GB')).toBe('Feb – Mar 2025');
		expect(albumRange('2025-02-14', '2025-03-01', 'de-DE')).toBe('Feb – März 2025');
		expect(albumRange('2019-06-15', '2026-01-02', 'en-GB')).toBe('2019–2026');
	});
});
