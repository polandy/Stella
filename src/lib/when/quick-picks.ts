import { dayParts } from '../dates/calendar';
import { addDays } from '../dates/month';
import type { PartialDate } from '../dates/partial-date';

/* The days a picker offers at one tap (docs/dev/02 §2.25.8); each record type names its own. */

export type QuickPick = 'saturday' | 'christmas' | 'birthday';

export interface QuickDay {
	pick: QuickPick;
	on: string;
}

const SATURDAY = 6;

/** The coming Saturday; today, when it is one. */
function saturdayFrom(today: string): string {
	const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
	return addDays(today, (SATURDAY - weekday + 7) % 7);
}

/** The next birthday from today on; none without a month and day. 29 February: 1 March. */
function nextBirthday(birth: PartialDate | null, today: string): string | null {
	if (birth === null || (birth.precision !== 'full' && birth.precision !== 'month_day'))
		return null;
	const parts = dayParts(birth.value);
	if (parts === null) return null;
	const year = Number(today.slice(0, 4));
	const inYear = (y: number) =>
		new Date(Date.UTC(y, parts.month - 1, parts.day)).toISOString().slice(0, 10);
	return inYear(year) >= today ? inYear(year) : inYear(year + 1);
}

/** The days `picks` stand for on `today`; Christmas this year and next while each lies ahead. */
export function quickDays(
	picks: readonly QuickPick[],
	birth: PartialDate | null,
	today: string
): QuickDay[] {
	const year = Number(today.slice(0, 4));
	return picks.flatMap((pick): QuickDay[] => {
		switch (pick) {
			case 'saturday':
				return [{ pick, on: saturdayFrom(today) }];
			case 'christmas':
				return [`${year}-12-24`, `${year + 1}-12-24`]
					.filter((on) => on >= today)
					.map((on) => ({ pick, on }));
			case 'birthday': {
				const on = nextBirthday(birth, today);
				return on === null ? [] : [{ pick, on }];
			}
		}
	});
}
