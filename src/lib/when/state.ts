import { dayParts } from '../dates/calendar';
import { addDays } from '../dates/month';
import type { PartialDate } from '../dates/partial-date';
import { WHEN_LEAD_DAYS, whenDay } from './resolve';
import type { When } from './when';

/* Where a record that waits for its time stands on a day (docs/dev/02 §2.25.8): derived, never stored. */

export type WhenState =
	/** Out of every count, folded under *Later*. */
	| { kind: 'waiting' }
	/** Within the lead time before its day: open again, the day ahead. */
	| { kind: 'soon'; on: string; approximate: boolean; inDays: number }
	/** Its day is here, or an age holds from then on; `on` is null for an age whose birth year went. */
	| { kind: 'due'; on: string | null; approximate: boolean }
	/** A birthday or a day gone by: it asks whether it still stands. */
	| { kind: 'passed'; on: string; approximate: boolean }
	/** *Later*, at its yearly look before `on`: it asks whether it still stands. */
	| { kind: 'review'; on: string };

/** What a record's state depends on besides its when and the day. */
export interface WhenHistory {
	birth: PartialDate | null;
	/** The day it was noted; *later* for someone without a birthday is looked at on its anniversary. */
	notedOn: string;
	/** The day somebody last answered its question, if ever. */
	checkedOn: string | null;
}

const DAY_MS = 86_400_000;

const daysFrom = (from: string, to: string) =>
	Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/** Where a when stands on `today`. */
export function whenState(when: When, history: WhenHistory, today: string): WhenState {
	if (when.kind === 'later') return laterState(history, today);
	const day = whenDay(when, history.birth);
	if (day === null) return { kind: 'due', on: null, approximate: false };
	const { on, approximate } = day;
	// An estimated year names no day: the year is the whole of what is known.
	const reached = approximate ? on.slice(0, 4) <= today.slice(0, 4) : on <= today;
	const over = approximate ? on.slice(0, 4) < today.slice(0, 4) : on < today;
	if (!reached) {
		return today < addDays(on, -WHEN_LEAD_DAYS)
			? { kind: 'waiting' }
			: { kind: 'soon', on, approximate, inDays: daysFrom(today, on) };
	}
	// *From an age* holds from then on; one birthday or one day can go by.
	if (over && when.kind !== 'from_age') return { kind: 'passed', on, approximate };
	return { kind: 'due', on, approximate };
}

/** Whether a record still waits on `today`; one for *now* never does. */
export function waits(when: When | null, history: WhenHistory, today: string): boolean {
	return when !== null && whenState(when, history, today).kind === 'waiting';
}

/** Whether a state asks somebody whether the record still stands. */
export function asks(state: WhenState): state is Extract<WhenState, { kind: 'passed' | 'review' }> {
	return state.kind === 'passed' || state.kind === 'review';
}

/** The month and day of a birthday; none for a bare or estimated year. */
function monthDayOf(birth: PartialDate | null): { month: number; day: number } | null {
	if (birth === null || (birth.precision !== 'full' && birth.precision !== 'month_day'))
		return null;
	const parts = dayParts(birth.value);
	return parts === null ? null : { month: parts.month, day: parts.day };
}

/** That month and day in `year`; 29 February falls on 1 March in a common year, as on Home. */
const inYear = ({ month, day }: { month: number; day: number }, year: number) =>
	new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);

/**
 * *Later* is looked at once a year, from `WHEN_LEAD_DAYS` before the birthday — or before the
 * anniversary of its noting — and asks until somebody answers.
 */
function laterState({ birth, notedOn, checkedOn }: WhenHistory, today: string): WhenState {
	const anchor = monthDayOf(birth) ?? monthDayOf({ value: notedOn, precision: 'full' });
	if (anchor === null) throw new Error(`Not a day: ${notedOn}`);
	const year = Number(today.slice(0, 4));
	// The latest look begun by today; last year's always has.
	const on = [year + 1, year, year - 1]
		.map((y) => inYear(anchor, y))
		.find((day) => addDays(day, -WHEN_LEAD_DAYS) <= today)!;
	const lastAnswer = checkedOn !== null && checkedOn > notedOn ? checkedOn : notedOn;
	return lastAnswer >= addDays(on, -WHEN_LEAD_DAYS) ? { kind: 'waiting' } : { kind: 'review', on };
}
