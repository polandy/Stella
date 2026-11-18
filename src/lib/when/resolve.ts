import { dayParts, isRealCalendarDay, FULL_DATE_SHAPE } from '../dates/calendar';
import { addDays } from '../dates/month';
import type { PartialDate } from '../dates/partial-date';
import { MONTH_SHAPE, WHEN_AGE_MAX, WHEN_AGE_MIN, type When } from './when';

/* When a when comes due, against the birth date and the household's day (docs/dev/02 §2.25.8). */

/** How long before its day a waiting record joins the open ones (owner decision 2026-11-17). */
export const WHEN_LEAD_DAYS = 90;

/** The day a when falls on; `approximate` when only the birth year is known, or estimated. */
export interface WhenDay {
	on: string;
	approximate: boolean;
}

/** A person's birth date as the record keeps it (docs/dev/03 §3.4), as one partial date. */
export function birthOf(contact: {
	birthDate: string | null;
	birthDatePrecision: PartialDate['precision'];
}): PartialDate | null {
	return contact.birthDate === null
		? null
		: { value: contact.birthDate, precision: contact.birthDatePrecision };
}

const pad = (n: number) => String(n).padStart(2, '0');

const CHRISTMAS_EVE = '-12-24';

/** The birth year, and the day when there is one; null when no year is known. */
function bornIn(birth: PartialDate | null): { year: number; month: number; day: number } | null {
	if (birth === null) return null;
	if (birth.precision === 'year' || birth.precision === 'age') {
		return /^\d{4}$/.test(birth.value) ? { year: Number(birth.value), month: 0, day: 0 } : null;
	}
	const parts = dayParts(birth.value);
	if (parts === null || parts.year === null) return null;
	return { year: parts.year, month: parts.month, day: parts.day };
}

/** Whether an age can be named for someone born so: their birth year is known, or estimated. */
export function knowsBirthYear(birth: PartialDate | null): boolean {
	return bornIn(birth) !== null;
}

/** The birthday on which someone born so turns `age`; null without a birth year. */
export function birthdayAtAge(birth: PartialDate | null, age: number): WhenDay | null {
	const born = bornIn(birth);
	if (born === null) return null;
	const year = born.year + age;
	if (born.month === 0) return { on: `${year}-01-01`, approximate: true };
	// `Date.UTC` rolls 29 February into 1 March in a common year, as `upcoming.ts` does.
	const on = new Date(Date.UTC(year, born.month - 1, born.day)).toISOString().slice(0, 10);
	return { on, approximate: false };
}

/** The Christmas Eve on which someone born so is `age` (ADR-135); null without a birth year. */
export function christmasAtAge(birth: PartialDate | null, age: number): WhenDay | null {
	const birthday = birthdayAtAge(birth, age);
	if (birthday === null) return null;
	const year = Number(birthday.on.slice(0, 4));
	// Born 25–31 December, they are still `age - 1` on that year's Christmas Eve.
	const later = !birthday.approximate && birthday.on.slice(5) > '12-24';
	return { on: `${later ? year + 1 : year}${CHRISTMAS_EVE}`, approximate: birthday.approximate };
}

/** How old someone born so is on `today`; null without a birth year. Estimated: by the year. */
export function ageOn(birth: PartialDate | null, today: string): number | null {
	const born = bornIn(birth);
	const now = dayParts(today);
	if (born === null || now === null || now.year === null) return null;
	const age = now.year - born.year;
	if (born.month === 0) return age;
	const hadBirthday = `${pad(now.month)}-${pad(now.day)}` >= `${pad(born.month)}-${pad(born.day)}`;
	return hadBirthday ? age : age - 1;
}

/** The last day of a month `YYYY-MM`. */
export function monthEnd(month: string): string {
	const [year, index] = month.split('-').map(Number);
	return new Date(Date.UTC(year, index, 0)).toISOString().slice(0, 10);
}

/**
 * The day a when falls on — a month's first — null for *later*, and for an age without a
 * birth year.
 */
export function whenDay(when: When, birth: PartialDate | null): WhenDay | null {
	switch (when.kind) {
		case 'from_age':
		case 'at_age':
			return birthdayAtAge(birth, when.age);
		case 'christmas_at_age':
			return christmasAtAge(birth, when.age);
		case 'on_date':
			return { on: when.on, approximate: false };
		case 'in_month':
			return { on: `${when.on}-01`, approximate: false };
		case 'later':
			return null;
	}
}

/**
 * Whether a when, as just chosen, waits: *later* always, a day until `WHEN_LEAD_DAYS` before it.
 * An age whose birth year went missing does not. A stored record's standing is `whenState`.
 */
export function isWaiting(when: When | null, birth: PartialDate | null, today: string): boolean {
	if (when === null) return false;
	if (when.kind === 'later') return true;
	const day = whenDay(when, birth);
	return day !== null && today < addDays(day.on, -WHEN_LEAD_DAYS);
}

/** What a when, as chosen, comes to on `today` — what the picker previews and the use-case checks. */
export type WhenOutlook =
	| { kind: 'now' }
	| { kind: 'later' }
	/** An age, for someone whose birth year nobody knows. */
	| { kind: 'needsBirthYear' }
	/** *From age N* for someone already N or older: it holds now, and is stored as *now*. */
	| { kind: 'ageReached'; age: number }
	/** *For the Nth birthday* once that birthday is over. */
	| { kind: 'birthdayPassed'; age: number }
	/** *Christmas at N* once that Christmas is over. */
	| { kind: 'christmasPassed'; age: number }
	| { kind: 'dayPassed' }
	| { kind: 'monthPassed' }
	| { kind: 'noSuchDay' }
	| { kind: 'badAge' }
	| {
			kind: 'due';
			when: Exclude<When, { kind: 'later' }>;
			on: string;
			approximate: boolean;
			/** Whether it waits from today, rather than joining the open ones at once. */
			waits: boolean;
	  };

/** How a when, as chosen for someone born so, stands on `today`. */
export function whenOutlook(
	when: When | null,
	birth: PartialDate | null,
	today: string
): WhenOutlook {
	if (when === null) return { kind: 'now' };
	if (when.kind === 'later') return { kind: 'later' };
	if (when.kind === 'on_date') {
		if (!FULL_DATE_SHAPE.test(when.on) || !isRealCalendarDay(when.on)) return { kind: 'noSuchDay' };
		if (when.on < today) return { kind: 'dayPassed' };
		return {
			kind: 'due',
			when,
			on: when.on,
			approximate: false,
			waits: isWaiting(when, birth, today)
		};
	}
	if (when.kind === 'in_month') {
		if (!MONTH_SHAPE.test(when.on)) return { kind: 'noSuchDay' };
		if (monthEnd(when.on) < today) return { kind: 'monthPassed' };
		const on = `${when.on}-01`;
		return { kind: 'due', when, on, approximate: false, waits: isWaiting(when, birth, today) };
	}
	if (!Number.isInteger(when.age) || when.age < WHEN_AGE_MIN || when.age > WHEN_AGE_MAX)
		return { kind: 'badAge' };
	const day = whenDay(when, birth);
	if (day === null) return { kind: 'needsBirthYear' };
	// An estimated year names no day: the year is the whole of what is known.
	const over = day.approximate ? day.on.slice(0, 4) < today.slice(0, 4) : day.on < today;
	const reached = day.approximate ? day.on.slice(0, 4) <= today.slice(0, 4) : day.on <= today;
	if (when.kind === 'from_age' && reached) return { kind: 'ageReached', age: ageOn(birth, today)! };
	if (when.kind === 'at_age' && over) return { kind: 'birthdayPassed', age: when.age };
	if (when.kind === 'christmas_at_age' && over) return { kind: 'christmasPassed', age: when.age };
	return { kind: 'due', when, ...day, waits: isWaiting(when, birth, today) };
}

/** What may be stored for a when, or why it may not. */
export type WhenCheck =
	| { ok: true; when: When | null }
	| { ok: false; problem: Exclude<WhenOutlook['kind'], 'now' | 'later' | 'ageReached' | 'due'> };

/** The when to store for a choice: *from an age already reached* is stored as *now*. */
export function checkWhen(when: When | null, birth: PartialDate | null, today: string): WhenCheck {
	const outlook = whenOutlook(when, birth, today);
	switch (outlook.kind) {
		case 'now':
		case 'ageReached':
			return { ok: true, when: null };
		case 'later':
		case 'due':
			return { ok: true, when };
		default:
			return { ok: false, problem: outlook.kind };
	}
}
