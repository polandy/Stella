/*
 * Upcoming important dates (docs/02 §2.13). Pure date arithmetic: given every date the viewer
 * may see, work out the next occurrence of each and keep the ones inside the horizon. There is
 * no reminder object — a date is either on the household's radar (`remind`) or it is not.
 *
 * Birthdays are normally *derived* from `contact.birth_date` and never duplicated; an explicit
 * `important_date` of kind `birthday` overrides the derived one, which is also how a birthday
 * gets muted (an explicit row with `remind` off).
 */

/** How far ahead Home looks. */
export const UPCOMING_HORIZON_DAYS = 30;

/** Most upcoming dates Home shows at once. */
export const UPCOMING_LIMIT = 5;

export type ImportantDateKind = 'birthday' | 'anniversary' | 'custom';

export const IMPORTANT_DATE_KINDS: readonly ImportantDateKind[] = [
	'birthday',
	'anniversary',
	'custom'
];

export interface UpcomingSource {
	contactId: string;
	contactName: string;
	avatarPhotoId: string | null;
	isDeceased: boolean;
	kind: ImportantDateKind;
	/** Free label for `custom` dates; null otherwise. */
	label: string | null;
	/** ISO `YYYY-MM-DD`, or `--MM-DD` when the year is unknown. */
	date: string;
	recursYearly: boolean;
	/** Whether the household wants to be reminded of it. */
	remind: boolean;
	/** True for a birthday read off `contact.birth_date` rather than an `important_date` row. */
	derived: boolean;
}

export interface UpcomingDate {
	contactId: string;
	contactName: string;
	avatarPhotoId: string | null;
	kind: ImportantDateKind;
	label: string | null;
	/** ISO date of the next occurrence. */
	date: string;
	/** Whole days from today; 0 means today. */
	daysUntil: number;
	/** Age or count reached at that occurrence, or null when the original year is unknown. */
	turning: number | null;
}

export interface UpcomingOptions {
	horizonDays?: number;
	limit?: number;
}

interface Ymd {
	/** Null when only the month and day are known (`--MM-DD`). */
	year: number | null;
	month: number;
	day: number;
}

const DAY_MS = 86_400_000;
const FULL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_DAY = /^--(\d{2})-(\d{2})$/;

/** Parse `YYYY-MM-DD` or `--MM-DD`; anything else (a bare year, an age) has no day to land on. */
function parseYmd(value: string): Ymd | null {
	const full = FULL_DATE.exec(value);
	if (full) return { year: Number(full[1]), month: Number(full[2]), day: Number(full[3]) };
	const md = MONTH_DAY.exec(value);
	if (md) return { year: null, month: Number(md[1]), day: Number(md[2]) };
	return null;
}

const utc = (year: number, month: number, day: number) => Date.UTC(year, month - 1, day);

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * The next occurrence of a recurring month/day on or after `from`. A 29 February date falls on
 * 1 March in a common year, so the anniversary is never silently skipped.
 */
function nextRecurrence(source: Ymd, from: Ymd): { ms: number; year: number } {
	for (let year = from.year!; ; year++) {
		const ms = utc(year, source.month, source.day);
		// `Date.UTC` rolls 29 February into 1 March in a common year, which is what we want.
		if (ms >= utc(from.year!, from.month, from.day)) return { ms, year };
	}
}

/**
 * The upcoming dates for a viewer, nearest first. Deceased people, muted dates, one-off dates
 * that have passed and anything beyond the horizon are left out; the derived birthday of a
 * contact that also has an explicit birthday row is dropped in favour of the explicit one.
 */
export function upcomingDates(
	sources: UpcomingSource[],
	today: string,
	options: UpcomingOptions = {}
): UpcomingDate[] {
	const horizonDays = options.horizonDays ?? UPCOMING_HORIZON_DAYS;
	const limit = options.limit ?? UPCOMING_LIMIT;
	const from = parseYmd(today);
	if (!from || from.year === null) throw new Error(`Not a calendar day: ${today}`);
	const todayMs = utc(from.year, from.month, from.day);

	// An explicit birthday row wins over the one derived from the contact's birth date.
	const explicitBirthdays = new Set(
		sources.filter((s) => s.kind === 'birthday' && !s.derived).map((s) => s.contactId)
	);

	const upcoming: UpcomingDate[] = [];
	for (const source of sources) {
		if (source.isDeceased || !source.remind) continue;
		if (source.derived && source.kind === 'birthday' && explicitBirthdays.has(source.contactId)) {
			continue;
		}
		const day = parseYmd(source.date);
		if (!day) continue;

		let ms: number;
		let occurrenceYear: number;
		if (source.recursYearly) {
			({ ms, year: occurrenceYear } = nextRecurrence(day, from));
		} else {
			// A one-off date needs a real year and only counts while it is still ahead.
			if (day.year === null) continue;
			ms = utc(day.year, day.month, day.day);
			occurrenceYear = day.year;
			if (ms < todayMs) continue;
		}

		const daysUntil = Math.round((ms - todayMs) / DAY_MS);
		if (daysUntil > horizonDays) continue;

		const turning = day.year !== null && occurrenceYear > day.year ? occurrenceYear - day.year : null;
		upcoming.push({
			contactId: source.contactId,
			contactName: source.contactName,
			avatarPhotoId: source.avatarPhotoId,
			kind: source.kind,
			label: source.label,
			date: iso(ms),
			daysUntil,
			turning
		});
	}

	return upcoming
		.sort(
			(a, b) =>
				a.daysUntil - b.daysUntil ||
				a.contactName.localeCompare(b.contactName) ||
				a.kind.localeCompare(b.kind)
		)
		.slice(0, limit);
}
