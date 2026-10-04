/*
 * A photo's capture date (docs/02 §2.14, docs/03 §photo). Pure, so the phone that reads it out
 * of a picture and the server that stores it judge it by the same rules.
 *
 * It is kept as the camera wrote it: the wall-clock time, `YYYY-MM-DDTHH:MM:SS`, followed by the
 * camera's UTC offset when it recorded one (`+02:00`, `Z`). Most cameras record none, and turning
 * the time into an instant would mean guessing a zone; kept as written, the day a photo shows is
 * the day on the photographer's calendar wherever it is looked at. Ordering needs an instant, and
 * there a time without an offset is read as UTC — off by a few hours at most, the same answer on
 * every device, and nothing next to the years a gallery spans.
 */

const TAKEN_AT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|([+-])(\d{2}):(\d{2}))?$/;

/** The widest offset any time zone uses (Kiribati, +14:00). */
const MAX_OFFSET_HOURS = 14;

/** Niépce's first photograph; anything earlier is a clock that was never set. */
const EARLIEST_PHOTOGRAPH_MS = Date.UTC(1826, 0, 1);

/**
 * How far past the server's clock a capture date may lie: the phone's clock may run ahead, and a
 * time without offset read as UTC may be up to 14 hours early or late.
 */
const CLOCK_SLACK_MS = 86_400_000;

/** Whether `value` is a capture date in the stored shape, naming a moment that exists. */
export function isTakenAt(value: string): boolean {
	const match = TAKEN_AT.exec(value);
	if (!match) return false;
	const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number) as [
		number,
		number,
		number,
		number,
		number,
		number
	];
	if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return false;
	if (hour > 23 || minute > 59 || second > 59) return false;
	if (match[8] !== undefined) {
		const offsetHours = Number(match[9]);
		const offsetMinutes = Number(match[10]);
		if (offsetHours > MAX_OFFSET_HOURS || offsetMinutes > 59) return false;
	}
	return true;
}

function daysInMonth(year: number, month: number): number {
	// Day 0 of the next month is the last day of this one.
	return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The moment a capture date names, in epoch ms; one without an offset is read as UTC. */
export function takenAtMs(value: string): number {
	const hasOffset = /(Z|[+-]\d{2}:\d{2})$/.test(value);
	return Date.parse(hasOffset ? value : `${value}Z`);
}

/** Whether a well-formed capture date could be real: not before photography, not in the future. */
export function isPlausibleTakenAt(value: string, nowMs: number): boolean {
	const at = takenAtMs(value);
	return at >= EARLIEST_PHOTOGRAPH_MS && at <= nowMs + CLOCK_SLACK_MS;
}

/** What a photo is dated by when photos are ordered: its capture, else when it was added. */
export interface Dated {
	takenAt: string | null;
	/** When it was added (epoch ms). */
	createdAt: number;
}

/** The moment a photo is ordered by (epoch ms). */
export function datedAt(photo: Dated): number {
	return photo.takenAt === null ? photo.createdAt : takenAtMs(photo.takenAt);
}

/**
 * The date a photo shows, for `dayLabel`: the camera's calendar day when the capture date is
 * known, else the moment it was added.
 */
export function photoDay(photo: Dated): string {
	return photo.takenAt === null ? new Date(photo.createdAt).toISOString() : photo.takenAt.slice(0, 10);
}
