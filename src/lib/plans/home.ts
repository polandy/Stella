/*
 * What Home shows of the outing ideas (docs/dev/02 §2.27.8): the next dated ones mixed into
 * *Coming up*, a passed one asking for a week, and on a person's date line what is booked and how
 * many ideas wait without a day. Pure; the visibility scoping happened in the read.
 */

import type { PartialDate } from '../dates/partial-date';
import { addDays } from '../dates/month';
import { monthEnd, whenDay } from '../when/resolve';
import type { When } from '../when/when';
import { planState, type PlanTiming } from './card';

/** How many dated ideas Home lists, however far ahead they are (owner decision E4). */
export const COMING_PLANS = 3;

/** How long a passed idea asks on Home before only its card marks it (owner decision E6). */
export const ASK_DAYS = 7;

/** An open idea the viewer may see, with what Home needs to place it. */
export interface HomePlan extends PlanTiming {
	id: string;
	contactId: string;
	visibility: 'shared' | 'private';
	hiddenFromPerson: boolean;
	/** The birth date of its person, for an age. */
	birth: PartialDate | null;
}

/** An idea placed on its day: a month's first, or the year of an estimated birth year. */
export interface PlacedPlan<T> {
	plan: T;
	on: string;
	approximate: boolean;
}

/** What the person's date line in *Coming up* adds: the booked ideas, and the undated count. */
export interface PlanLine<T> {
	booked: T[];
	undated: number;
}

export interface HomePlans<T> {
	/** Passed and not done, within `ASK_DAYS` of being over; the longest gone first. */
	asking: PlacedPlan<T>[];
	/** The next `COMING_PLANS` dated ones, soonest first. */
	coming: PlacedPlan<T>[];
	/** By person, for those who have a date line only. */
	lines: Map<string, PlanLine<T>>;
}

/** The last day a placed when still holds: its day, a month's last, an estimated year's end. */
function lastDay(when: When, { on, approximate }: { on: string; approximate: boolean }): string {
	if (when.kind === 'in_month') return monthEnd(when.on);
	return approximate ? `${on.slice(0, 4)}-12-31` : on;
}

/** Divide the open ideas for Home; `withLine` holds the people who have a date in *Coming up*. */
export function homePlans<T extends HomePlan>(
	plans: readonly T[],
	withLine: ReadonlySet<string>,
	today: string
): HomePlans<T> {
	const asking: PlacedPlan<T>[] = [];
	const dated: PlacedPlan<T>[] = [];
	const lines = new Map<string, PlanLine<T>>();
	const lineOf = (contactId: string) => {
		let line = lines.get(contactId);
		if (!line) lines.set(contactId, (line = { booked: [], undated: 0 }));
		return line;
	};
	for (const plan of plans) {
		if (plan.doneOn !== null) continue;
		const state = planState(plan, plan.birth, today);
		const day = plan.when && whenDay(plan.when, plan.birth);
		// An age reached holds from then on: it has no day left, as *some time* has none.
		const undated = !plan.when || !day || (state?.kind === 'due' && plan.when.kind === 'from_age');
		if (state?.kind === 'passed') {
			if (today <= addDays(lastDay(plan.when!, state), ASK_DAYS))
				asking.push({ plan, on: state.on, approximate: state.approximate });
			continue;
		}
		const onLine = withLine.has(plan.contactId);
		if (plan.bookedAt !== null && onLine) lineOf(plan.contactId).booked.push(plan);
		else if (undated) {
			if (onLine && plan.bookedAt === null) lineOf(plan.contactId).undated++;
		} else dated.push({ plan, on: day.on, approximate: day.approximate });
	}
	const soonest = (a: PlacedPlan<T>, b: PlacedPlan<T>) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0);
	asking.sort(soonest);
	dated.sort(soonest);
	return { asking, coming: dated.slice(0, COMING_PLANS), lines };
}

/** One row of *Coming up*: a date, an idea that asks, or an idea ahead. */
export type ComingUpRow<D, T> =
	| { kind: 'date'; date: D }
	| ({ kind: 'ask' } & PlacedPlan<T>)
	| ({ kind: 'plan' } & PlacedPlan<T>);

/** The asking ideas first, then dates and ideas by day; a date before an idea on the same day. */
export function comingUpRows<D extends { date: string }, T>(
	dates: readonly D[],
	asking: readonly PlacedPlan<T>[],
	coming: readonly PlacedPlan<T>[]
): ComingUpRow<D, T>[] {
	const ahead: ComingUpRow<D, T>[] = [];
	let i = 0;
	for (const date of dates) {
		while (i < coming.length && coming[i].on < date.date)
			ahead.push({ kind: 'plan', ...coming[i++] });
		ahead.push({ kind: 'date', date });
	}
	while (i < coming.length) ahead.push({ kind: 'plan', ...coming[i++] });
	return [...asking.map((row) => ({ kind: 'ask' as const, ...row })), ...ahead];
}

/** The row the folded line names: never a private idea nor a surprise (docs/dev/05 §5.5.1). */
export function comingUpFirst<D, T extends Pick<HomePlan, 'visibility' | 'hiddenFromPerson'>>(
	rows: readonly ComingUpRow<D, T>[]
): ComingUpRow<D, T> | null {
	return (
		rows.find(
			(row) =>
				row.kind === 'date' || (row.plan.visibility === 'shared' && !row.plan.hiddenFromPerson)
		) ?? null
	);
}

/** The same when, a year on: *Next year* on a passed idea; null for one that never passes. */
export function nextYearWhen(when: When): When | null {
	switch (when.kind) {
		case 'on_date': {
			// 29 February falls on 1 March, as a birthday does.
			const [year, month, day] = when.on.split('-').map(Number);
			return {
				kind: 'on_date',
				on: new Date(Date.UTC(year + 1, month - 1, day)).toISOString().slice(0, 10)
			};
		}
		case 'in_month':
			return { kind: 'in_month', on: `${Number(when.on.slice(0, 4)) + 1}${when.on.slice(4)}` };
		case 'at_age':
			return { kind: 'at_age', age: when.age + 1 };
		default:
			return null;
	}
}
