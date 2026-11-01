/*
 * The iCalendar text of a subscribed calendar (RFC 5545; docs/02 §2.13.4). Pure: the events
 * arrive already worded in the member's language, and the stamp is the caller's reading of
 * the clock, so the same input always gives the same bytes — which is what the feed's ETag
 * relies on.
 *
 * Every event is an all-day one (`VALUE=DATE`, the end the day after, as RFC 5545 §3.6.1 has
 * it) and marked free, so a birthday never blocks a day in the member's calendar. There is no
 * `VALARM`: when and whether to be reminded is the calendar's setting, per member.
 */

/** One date in the calendar. */
export interface IcsEvent {
	/** Stable across fetches, so an edited date replaces its event rather than adding one. */
	uid: string;
	/** The first day, ISO `YYYY-MM-DD`. */
	start: string;
	/** Repeats every year from `start` on. */
	yearly: boolean;
	summary: string;
	description: string | null;
	url: string | null;
}

export interface IcsCalendar {
	/** The calendar's name, as the subscribing app first shows it. */
	name: string;
	/** `DTSTAMP` of every event, epoch milliseconds. */
	stamp: number;
	events: readonly IcsEvent[];
}

const CRLF = '\r\n';

/** RFC 5545 §3.1: a content line is at most 75 octets before its line break. */
const MAX_OCTETS = 75;

/** How often a subscribing app should look again; most honour one of the two. */
const REFRESH = 'PT12H';

/** RFC 5545 §3.3.11: backslash, semicolon, comma and line breaks are escaped in TEXT. */
export function escapeText(value: string): string {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\r?\n/g, '\\n');
}

/**
 * Fold a content line at 75 octets, each continuation starting with one space (RFC 5545
 * §3.1). Counted in UTF-8 octets, and never through the middle of a character.
 */
export function foldLine(line: string): string {
	const encoder = new TextEncoder();
	const parts: string[] = [];
	let current = '';
	let octets = 0;
	for (const char of line) {
		const size = encoder.encode(char).length;
		// A continuation's leading space counts towards its 75.
		const limit = parts.length === 0 ? MAX_OCTETS : MAX_OCTETS - 1;
		if (octets + size > limit) {
			parts.push(current);
			current = '';
			octets = 0;
		}
		current += char;
		octets += size;
	}
	parts.push(current);
	return parts.join(CRLF + ' ');
}

/** `YYYY-MM-DD` → `YYYYMMDD`. */
const basicDate = (iso: string) => iso.replaceAll('-', '');

/** The day after an ISO day, as `YYYYMMDD`. */
function dayAfter(iso: string): string {
	const [year, month, day] = iso.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, day + 1))
		.toISOString()
		.slice(0, 10)
		.replaceAll('-', '');
}

/** Epoch milliseconds → `YYYYMMDDTHHMMSSZ`. */
const utcStamp = (ms: number) =>
	new Date(ms)
		.toISOString()
		.replace(/\.\d{3}Z$/, 'Z')
		.replace(/[-:]/g, '');

/**
 * The yearly rule. 29 February repeats on the last day of February, so a common year shows it
 * on the 28th instead of skipping it — which a plain `FREQ=YEARLY` would do.
 */
const yearlyRule = (start: string) =>
	start.endsWith('-02-29') ? 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1' : 'FREQ=YEARLY';

function eventLines(event: IcsEvent, stamp: string): string[] {
	const lines = [
		'BEGIN:VEVENT',
		`UID:${event.uid}`,
		`DTSTAMP:${stamp}`,
		`DTSTART;VALUE=DATE:${basicDate(event.start)}`,
		`DTEND;VALUE=DATE:${dayAfter(event.start)}`
	];
	if (event.yearly) lines.push(`RRULE:${yearlyRule(event.start)}`);
	lines.push(`SUMMARY:${escapeText(event.summary)}`);
	const description = [event.description, event.url].filter((part) => part !== null).join('\n');
	if (description !== '') lines.push(`DESCRIPTION:${escapeText(description)}`);
	if (event.url !== null) lines.push(`URL:${event.url}`);
	lines.push('TRANSP:TRANSPARENT', 'END:VEVENT');
	return lines;
}

/** The whole calendar, CRLF-ended and folded, ready to serve as `text/calendar`. */
export function writeIcs(calendar: IcsCalendar): string {
	const stamp = utcStamp(calendar.stamp);
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Stella//Calendar//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		`X-WR-CALNAME:${escapeText(calendar.name)}`,
		`REFRESH-INTERVAL;VALUE=DURATION:${REFRESH}`,
		`X-PUBLISHED-TTL:${REFRESH}`,
		...calendar.events.flatMap((event) => eventLines(event, stamp)),
		'END:VCALENDAR'
	];
	return lines.map(foldLine).join(CRLF) + CRLF;
}
