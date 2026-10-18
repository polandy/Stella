import { createTranslator } from '$lib/i18n/translate';
import type { ActivityWording } from '$lib/server/domain/activity/activity';

/*
 * The activity log's localized lines (docs/02 §2.19), from the catalogues. The entry is data the
 * household keeps, so it is written once, in the language of the member who caused it, and stays
 * as written.
 */
export const activityWording: ActivityWording = {
	restored: (locale, people, household) => {
		const t = createTranslator(locale);
		return t('archive.restoredSummary', {
			people: t('archive.peopleCount', { count: people }),
			household
		});
	},
	imported: (locale, { people, completed }, source) => {
		const t = createTranslator(locale);
		const count = (n: number) => t('archive.peopleCount', { count: n });
		if (completed === 0) return t('import.api.loggedSummary', { people: count(people), source });
		if (people === 0) return t('import.api.loggedCompleted', { people: count(completed), source });
		return t('import.api.loggedSummaryAndCompleted', {
			people: count(people),
			completed: count(completed),
			source
		});
	}
};
