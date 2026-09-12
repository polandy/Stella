import { getContext, setContext } from 'svelte';
import { INTL_LOCALES, type Locale } from './locales';
import { createTranslator, type Translate } from './translate';

/*
 * How a component reaches the viewer's language (docs/04 §4.4). The root layout provides it
 * from the server-resolved locale; components read it and stay unaware of where it came from.
 * The getter — rather than a captured value — keeps `t(…)` reactive to a language change.
 */

const I18N_KEY = Symbol('stella:i18n');

/** The language of the current page, and the translator bound to it. */
export interface I18n {
	readonly locale: Locale;
	/** The BCP-47 tag for `Intl` formatting in this language. */
	readonly intlLocale: string;
	readonly t: Translate;
}

/** Called once by the root layout, with a getter over the locale carried in page data. */
export function provideI18n(getLocale: () => Locale): I18n {
	const i18n: I18n = {
		get locale() {
			return getLocale();
		},
		get intlLocale() {
			return INTL_LOCALES[getLocale()];
		},
		t: (key, ...params) => createTranslator(getLocale())(key, ...params)
	};
	return setContext(I18N_KEY, i18n);
}

/** The language and translator for the current page. */
export function useI18n(): I18n {
	const i18n = getContext<I18n | undefined>(I18N_KEY);
	if (!i18n) throw new Error('useI18n() was called outside the root layout that provides it.');
	return i18n;
}

/** The translator alone, for the common case of a component that only renders copy. */
export function useTranslate(): Translate {
	return useI18n().t;
}
