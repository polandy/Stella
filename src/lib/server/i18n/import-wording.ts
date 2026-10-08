import { dayLabel } from '$lib/dates/labels';
import { INTL_LOCALES } from '$lib/i18n/locales';
import { createTranslator } from '$lib/i18n/translate';
import type { ImportWording } from '$lib/server/domain/import/monica/plan';

/*
 * The words the importer writes *into* the household's data (docs/02 §2.16): a gift note's
 * title, the day a life event happened. They are content rather than interface, so they are
 * written once, in the language of the member running the import, and stay as written.
 */

/** The plan's wording, in the language of the request that started the import. */
export function importWording(locals: App.Locals): ImportWording {
	const t = createTranslator(locals.locale);
	const lang = { t, intlLocale: INTL_LOCALES[locals.locale] };
	return {
		gift: t('import.note.gift'),
		lifeEvent: t('import.note.lifeEvent'),
		pet: t('import.note.pet'),
		monicaActivity: (kind) => t('import.note.monicaActivity', { kind }),
		metThrough: (name) => t('import.metThrough', { name }),
		metThroughInfo: (info, name) => t('import.metThroughInfo', { info, name }),
		day: (isoDay) => dayLabel(lang, isoDay)
	};
}
