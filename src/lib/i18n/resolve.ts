import { isLocale, negotiateLocale, type Locale } from './locales';

/*
 * Which language a request is answered in (docs/02 §2.19). Pure, so the precedence is a
 * unit test rather than something to reason about while reading `hooks.server.ts`.
 */

/** Everything a request can say about the language its sender wants. */
export interface LocaleSignals {
	/** The signed-in user's stored preference, if there is one. */
	user?: Locale | null;
	/** The choice an anonymous visitor made earlier, from the language cookie. */
	cookie?: string | null;
	/** The browser's `Accept-Language` header. */
	acceptLanguage?: string | null;
}

/**
 * The profile wins — it is the choice the person made and it follows them between devices.
 * Otherwise the cookie (the same choice, made before signing in), and failing that the
 * browser's own preference.
 */
export function resolveLocale(signals: LocaleSignals): Locale {
	if (signals.user) return signals.user;
	if (isLocale(signals.cookie)) return signals.cookie;
	return negotiateLocale(signals.acceptLanguage);
}
