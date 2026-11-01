import { describe, expect, test } from 'bun:test';
import { escapeText, foldLine, writeIcs, type IcsEvent } from './ics';

const STAMP = Date.UTC(2026, 10, 1, 9, 30, 0);

function event(over: Partial<IcsEvent> = {}): IcsEvent {
	return {
		uid: 'c1-birthday@stella',
		start: '2015-11-12',
		yearly: true,
		summary: "Anna's birthday",
		description: null,
		url: null,
		...over
	};
}

const lines = (ics: string) => ics.split('\r\n');

describe('writeIcs', () => {
	test('wraps the events in one calendar, every line ended by CRLF', () => {
		const ics = writeIcs({ name: 'Stella', stamp: STAMP, events: [event()] });
		expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
		expect(ics.replaceAll('\r\n', '')).not.toContain('\n');
		const all = lines(ics);
		expect(all.slice(0, 3)).toEqual([
			'BEGIN:VCALENDAR',
			'VERSION:2.0',
			'PRODID:-//Stella//Calendar//EN'
		]);
		expect(all).toContain('X-WR-CALNAME:Stella');
		expect(all.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1);
	});

	test('a recurring date is one all-day event repeating every year', () => {
		const all = lines(writeIcs({ name: 'Stella', stamp: STAMP, events: [event()] }));
		expect(all).toContain('UID:c1-birthday@stella');
		expect(all).toContain('DTSTAMP:20261101T093000Z');
		expect(all).toContain('DTSTART;VALUE=DATE:20151112');
		expect(all).toContain('DTEND;VALUE=DATE:20151113');
		expect(all).toContain('RRULE:FREQ=YEARLY');
		expect(all).toContain("SUMMARY:Anna's birthday");
		expect(all).toContain('TRANSP:TRANSPARENT');
		expect(all.some((l) => l.startsWith('BEGIN:VALARM'))).toBe(false);
	});

	test('a one-off date is a single event', () => {
		const all = lines(
			writeIcs({
				name: 'Stella',
				stamp: STAMP,
				events: [event({ start: '2027-06-30', yearly: false })]
			})
		);
		expect(all).toContain('DTSTART;VALUE=DATE:20270630');
		expect(all).toContain('DTEND;VALUE=DATE:20270701');
		expect(all.some((l) => l.startsWith('RRULE'))).toBe(false);
	});

	test('29 February repeats on the last day of February, so a common year keeps it', () => {
		const all = lines(
			writeIcs({ name: 'Stella', stamp: STAMP, events: [event({ start: '2000-02-29' })] })
		);
		expect(all).toContain('DTSTART;VALUE=DATE:20000229');
		expect(all).toContain('DTEND;VALUE=DATE:20000301');
		expect(all).toContain('RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1');
	});

	test('the end of a year rolls into the next', () => {
		const all = lines(
			writeIcs({ name: 'Stella', stamp: STAMP, events: [event({ start: '1990-12-31' })] })
		);
		expect(all).toContain('DTEND;VALUE=DATE:19910101');
	});

	test('writes the description and the link when there are any', () => {
		const all = lines(
			writeIcs({
				name: 'Stella',
				stamp: STAMP,
				events: [event({ description: 'Born 2015', url: 'https://stella.example/people/c1' })]
			})
		);
		expect(all).toContain('DESCRIPTION:Born 2015\\nhttps://stella.example/people/c1');
		expect(all).toContain('URL:https://stella.example/people/c1');
	});

	test('an empty calendar is still a calendar', () => {
		const ics = writeIcs({ name: 'Stella', stamp: STAMP, events: [] });
		expect(ics).toContain('BEGIN:VCALENDAR');
		expect(ics).not.toContain('BEGIN:VEVENT');
	});

	test('escapes the text a member typed', () => {
		const all = lines(
			writeIcs({ name: 'Stella', stamp: STAMP, events: [event({ summary: 'Tom; Ben, and\\ co' })] })
		);
		expect(all).toContain('SUMMARY:Tom\\; Ben\\, and\\\\ co');
	});
});

describe('escapeText', () => {
	test('escapes backslash, semicolon, comma and line breaks', () => {
		expect(escapeText('a\\b;c,d\ne\r\nf')).toBe('a\\\\b\\;c\\,d\\ne\\nf');
	});
});

describe('foldLine', () => {
	const octets = (s: string) => new TextEncoder().encode(s).length;

	test('leaves a short line alone', () => {
		expect(foldLine('SUMMARY:short')).toBe('SUMMARY:short');
	});

	test('folds at 75 octets, each continuation starting with a space', () => {
		const folded = foldLine('DESCRIPTION:' + 'x'.repeat(200));
		const parts = folded.split('\r\n');
		expect(parts.length).toBeGreaterThan(2);
		for (const part of parts) expect(octets(part)).toBeLessThanOrEqual(75);
		for (const part of parts.slice(1)) expect(part.startsWith(' ')).toBe(true);
		expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(
			'DESCRIPTION:' + 'x'.repeat(200)
		);
	});

	test('never splits a character across lines', () => {
		const line = 'SUMMARY:' + 'ü'.repeat(60);
		const parts = foldLine(line).split('\r\n');
		for (const part of parts) expect(octets(part)).toBeLessThanOrEqual(75);
		expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(line);
	});
});
