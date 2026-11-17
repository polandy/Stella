import { dayLabel, whenLabel, type DateLanguage } from '../dates/labels';
import { whenStateChip } from '../when/labels';
import type { When } from '../when/when';

/* How an idea's day reads on Home (docs/dev/02 §2.27.8): spoken near, dated far, a month by name. */

const DAY_MS = 86_400_000;
/** Beyond this, a weekday alone would leave the year to guess. */
const NAMES_YEAR_AFTER = 180;
const MONTHS_IN_YEAR = 12;

const daysFrom = (from: string, to: string) =>
	Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/** A month by name, with its year only once it is a year or more ahead: *in March*. */
function monthWords(lang: DateLanguage, month: string, today: string): string {
	const ahead =
		(Number(month.slice(0, 4)) - Number(today.slice(0, 4))) * MONTHS_IN_YEAR +
		(Number(month.slice(5, 7)) - Number(today.slice(5, 7)));
	return new Date(`${month}-01T00:00:00Z`).toLocaleDateString(lang.intlLocale, {
		timeZone: 'UTC',
		month: 'long',
		...(ahead >= MONTHS_IN_YEAR ? { year: 'numeric' } : {})
	});
}

/** The day of an idea ahead, as *Coming up* says it. */
export function planDayLabel(
	lang: DateLanguage,
	when: When,
	placed: { on: string; approximate: boolean },
	today: string
): string {
	if (when.kind === 'in_month')
		return lang.t('home.planInMonth', { month: monthWords(lang, when.on, today) });
	if (placed.approximate) return lang.t('when.chip.about', { year: placed.on.slice(0, 4) });
	const days = daysFrom(today, placed.on);
	return days > NAMES_YEAR_AFTER ? dayLabel(lang, placed.on) : whenLabel(lang, days, placed.on);
}

/** The day of a passed idea that asks: *On 15 November 2026 · passed*. */
export function passedPlanLabel(
	lang: DateLanguage,
	when: When,
	placed: { on: string; approximate: boolean },
	today: string
): string {
	return whenStateChip(lang, when, { kind: 'passed', ...placed }, today);
}
