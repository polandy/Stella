import { dayLabel, type DateLanguage } from '../dates/labels';
import { addDays } from '../dates/month';
import { WHEN_LEAD_DAYS, type WhenOutlook } from './resolve';
import type { When } from './when';

/* How a when reads (docs/dev/02 §2.25.8): the chip on a row, and the line under the picker. */

const CHRISTMAS = '-12-24';

/** The chip on a waiting record's row: *From age 8*, *For the 10th birthday*, *Christmas 2027*. */
export function whenChip(lang: DateLanguage, when: When): string {
	switch (when.kind) {
		case 'from_age':
			return lang.t('when.chip.fromAge', { age: when.age });
		case 'at_age':
			return lang.t('when.chip.atAge', { age: when.age });
		case 'on_date':
			return when.on.endsWith(CHRISTMAS)
				? lang.t('when.christmas', { year: when.on.slice(0, 4) })
				: lang.t('when.chip.onDay', { day: dayLabel(lang, when.on) });
		case 'later':
			return lang.t('when.kind.later');
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
