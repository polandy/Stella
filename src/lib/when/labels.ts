import { dayLabel, type DateLanguage } from '../dates/labels';
import { addDays } from '../dates/month';
import { WHEN_LEAD_DAYS, type WhenOutlook } from './resolve';
import type { WhenState } from './state';
import type { When } from './when';

/* How a when reads (docs/dev/02 §2.25.8): the chip on a row, and the line under the picker. */

const CHRISTMAS = '-12-24';

/** A month `YYYY-MM` with its year: *May 2027*. */
export function monthLabel(lang: DateLanguage, month: string): string {
	return new Date(`${month}-01T00:00:00Z`).toLocaleDateString(lang.intlLocale, {
		timeZone: 'UTC',
		month: 'long',
		year: 'numeric'
	});
}

/** The chip on a waiting record's row: *From age 8*, *For the 10th birthday*, *Christmas at 6*, *Christmas 2027*. */
export function whenChip(lang: DateLanguage, when: When): string {
	switch (when.kind) {
		case 'from_age':
			return lang.t('when.chip.fromAge', { age: when.age });
		case 'at_age':
			return lang.t('when.chip.atAge', { age: when.age });
		case 'christmas_at_age':
			return lang.t('when.chip.christmasAtAge', { age: when.age });
		case 'on_date':
			return when.on.endsWith(CHRISTMAS)
				? lang.t('when.christmas', { year: when.on.slice(0, 4) })
				: lang.t('when.chip.onDay', { day: dayLabel(lang, when.on) });
		case 'in_month':
			return lang.t('when.chip.inMonth', { month: monthLabel(lang, when.on) });
		case 'later':
			return lang.t('when.kind.later');
	}
}

/** The chip once its day draws near or went by: *For the 6th birthday · in 34 days*. */
export function whenStateChip(
	lang: DateLanguage,
	when: When,
	state: WhenState | null,
	today: string
): string {
	const chip = whenChip(lang, when);
	switch (state?.kind) {
		case 'soon': {
			const ahead = state.approximate
				? lang.t('when.chip.about', { year: state.on.slice(0, 4) })
				: state.inDays === 1
					? lang.t('when.chip.tomorrow')
					: lang.t('dates.inDays', { days: state.inDays });
			return `${chip} · ${ahead}`;
		}
		case 'due':
			return state.on === today && when.kind !== 'in_month'
				? `${chip} · ${lang.t('when.chip.today')}`
				: chip;
		case 'passed':
			return `${chip} · ${lang.t('when.chip.passed')}`;
		default:
			return chip;
	}
}

/** What the choice comes to, in a sentence or two — or why it cannot be kept. */
export function whenPreview(lang: DateLanguage, outlook: WhenOutlook): string {
	switch (outlook.kind) {
		case 'now':
			return lang.t('when.preview.now');
		case 'later':
			return lang.t('when.preview.later');
		case 'ageReached':
			return lang.t('when.preview.ageReached', { age: outlook.age });
		case 'due': {
			const { when, on, approximate, waits } = outlook;
			const day =
				when.kind === 'on_date'
					? lang.t('when.preview.onDay', { day: dayLabel(lang, on) })
					: when.kind === 'in_month'
						? lang.t('when.preview.inMonth', { month: monthLabel(lang, when.on) })
						: when.kind === 'christmas_at_age'
							? lang.t(approximate ? 'when.preview.christmasAbout' : 'when.preview.christmas', {
									age: when.age,
									year: on.slice(0, 4)
								})
							: approximate
								? lang.t('when.preview.turnsAbout', { age: when.age, year: on.slice(0, 4) })
								: lang.t('when.preview.turns', { age: when.age, day: dayLabel(lang, on) });
			const stands = waits
				? lang.t('when.preview.waits', { day: dayLabel(lang, addDays(on, -WHEN_LEAD_DAYS)) })
				: lang.t('when.preview.open');
			return `${day} ${stands}`;
		}
		default:
			return lang.t(`errors.when.${outlook.kind}`);
	}
}
