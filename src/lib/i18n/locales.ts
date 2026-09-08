/*
 * The languages Stella speaks (docs/02 §2.19). Pure and framework-free: the same list backs
 * the `user.locale_pref` column, the cookie an anonymous visitor carries, and the language
 * picker — so a new language is added here once rather than in every layer.
 */

/** Every language the interface is fully translated into. */
export const LOCALES = ['en', 'de'] as const;

/** One of `LOCALES`. */
export type Locale = (typeof LOCALES)[number];

/** What an untranslated string falls back to, and what a visitor gets with no other signal. */
export const DEFAULT_LOCALE: Locale = 'en';

/** Cookie remembering the choice of a visitor who has not signed in (or not yet loaded). */
export const LOCALE_COOKIE = 'stella-locale';

/** How long the language cookie survives, in seconds — a year, like the choice itself. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Each language named in itself, the way a picker has to show it. */
export const LOCALE_NAMES: Record<Locale, string> = {
	en: 'English',
	de: 'Deutsch'
};

/**
 * The BCP-47 tag used for `Intl` formatting. Separate from the message locale because dates
 * and numbers need a region ("de-DE", "en-GB") while the catalogue does not.
 */
export const INTL_LOCALES: Record<Locale, string> = {
	en: 'en-GB',
	de: 'de-DE'
};

/** Whether `value` is a language Stella supports. */
export function isLocale(value: unknown): value is Locale {
	return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Pick a language from an `Accept-Language` header, honouring quality values and matching
 * "de-AT" to "de". Falls back to `DEFAULT_LOCALE` when the header is absent or offers
 * nothing we speak.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
	if (!acceptLanguage) return DEFAULT_LOCALE;

	const ranked = acceptLanguage
		.split(',')
		.map((part) => {
			const [tag, ...params] = part.trim().split(';');
			const q = params
				.map((p) => p.trim())
				.find((p) => p.startsWith('q='))
				?.slice(2);
			const quality = q === undefined ? 1 : Number.parseFloat(q);
			return { tag: tag.trim().toLowerCase(), quality: Number.isNaN(quality) ? 0 : quality };
		})
		.filter((entry) => entry.tag.length > 0 && entry.quality > 0)
		.sort((a, b) => b.quality - a.quality);

	for (const { tag } of ranked) {
		const base = tag.split('-')[0];
		if (isLocale(base)) return base;
	}
	return DEFAULT_LOCALE;
}
