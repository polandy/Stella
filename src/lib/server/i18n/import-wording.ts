import { dayLabel } from '$lib/dates/labels';
import { INTL_LOCALES, LOCALES } from '$lib/i18n/locales';
import { createTranslator } from '$lib/i18n/translate';
import type { KnownLabel } from '$lib/import-match/card';
import type { ImportWording } from '$lib/server/domain/import/monica/plan';
import type { KnownLabelOf } from '$lib/server/domain/nextcloud/linked-person';

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
		day: (isoDay) => dayLabel(lang, isoDay),
		fieldLabel: (label) => t(`import.review.label.${label}`)
	};
}

const KNOWN_LABELS: readonly KnownLabel[] = ['home', 'work', 'mobile'];

/**
 * Each shared label's word in every language, lower case, to the label it is. Built on first
 * use: the server loads every catalogue at start-up, after this module is imported.
 */
let knownWords: Map<string, KnownLabel> | null = null;
const wordsOfKnownLabels = () =>
	(knownWords ??= new Map(
		LOCALES.flatMap((locale) => {
			const t = createTranslator(locale);
			return KNOWN_LABELS.map((label) => [t(`import.review.label.${label}`).toLowerCase(), label]);
		})
	));

/**
 * The shared label a label typed in Stella is, in whichever language it was typed: written to
 * the linked book the way every address book writes it (docs/02 §2.16.3).
 */
export const knownLabel: KnownLabelOf = (text) =>
	wordsOfKnownLabels().get(text.trim().toLowerCase()) ?? null;

/** What a sync of the linked book writes, in the language of the member who started it. */
export const nextcloudWording = (locals: App.Locals) => ({ ...importWording(locals), knownLabel });
