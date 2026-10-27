import { INTL_LOCALES } from '$lib/i18n/locales';
import { createTranslator } from '$lib/i18n/translate';
import type { ActivityWording } from '$lib/server/domain/activity/activity';
import { sourceWord } from '$lib/import-match/card';

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
	imported: (locale, { people, completed, circlesChanged }, source) => {
		const t = createTranslator(locale);
		const count = (n: number) => t('archive.peopleCount', { count: n });
		// The people imported are named whenever nothing else is (an entry adding nothing is never logged).
		const clauses = [
			...(people > 0 || (completed === 0 && circlesChanged === 0)
				? [t('import.api.loggedImported', { people: count(people) })]
				: []),
			...(completed > 0 ? [t('import.api.loggedCompleted', { people: count(completed) })] : []),
			...(circlesChanged > 0
				? [
						t('import.api.loggedCirclesChanged', {
							circles: t('import.api.circleCount', { count: circlesChanged })
						})
					]
				: [])
		];
		const list = new Intl.ListFormat(INTL_LOCALES[locale], { type: 'conjunction' }).format(clauses);
		return t('import.api.loggedSummary', { list, source });
	},
	reviewed: (locale, { people, completed }, source) => {
		const t = createTranslator(locale);
		const count = (n: number) => t('archive.peopleCount', { count: n });
		// The people imported are named whenever nothing else is, as in the API's line.
		const clauses = [
			...(people > 0 || completed === 0
				? [t('import.api.loggedImported', { people: count(people) })]
				: []),
			...(completed > 0 ? [t('import.api.loggedCompleted', { people: count(completed) })] : [])
		];
		const list = new Intl.ListFormat(INTL_LOCALES[locale], { type: 'conjunction' }).format(clauses);
		return t('import.review.loggedSummary', {
			list,
			source: t(`import.review.source.${sourceWord(source)}`)
		});
	}
};
