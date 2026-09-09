import { de } from './messages/de';
import { en } from './messages/en';
import { DEFAULT_LOCALE, type Locale } from './locales';

/*
 * The translator (docs/02 §2.19). Messages live in typed catalogues keyed by dotted names;
 * a message that needs values is a function, so its parameters are checked by the compiler
 * instead of being interpolated by hand at every call site.
 */

/** The shape every catalogue has: English is the source of truth for the key set. */
export type Messages = typeof en;

/** A dotted message name, e.g. `nav.people`. */
export type MessageKey = keyof Messages;

/** The parameters a message takes: none for a plain string, one object for a function. */
export type MessageParams<K extends MessageKey> = Messages[K] extends (params: infer P) => string
	? [P]
	: [];

/** Looks a message up in the viewer's language and fills in its parameters. */
export type Translate = <K extends MessageKey>(key: K, ...params: MessageParams<K>) => string;

const CATALOGS: Record<Locale, Messages> = { en, de };

const translators = new Map<Locale, Translate>();

/**
 * The translator for one language. A message missing from a translation falls back to
 * English rather than showing a raw key; a key missing everywhere is a programming error
 * and throws.
 */
export function createTranslator(locale: Locale): Translate {
	const cached = translators.get(locale);
	if (cached) return cached;

	const catalog = CATALOGS[locale] ?? CATALOGS[DEFAULT_LOCALE];
	const translate = (<K extends MessageKey>(key: K, ...params: MessageParams<K>): string => {
		const message = catalog[key] ?? CATALOGS[DEFAULT_LOCALE][key];
		if (message === undefined) throw new Error(`Unknown message key: ${String(key)}`);
		return typeof message === 'function'
			? (message as (values: unknown) => string)(params[0])
			: message;
	}) as Translate;

	translators.set(locale, translate);
	return translate;
}

/** Whether a name — often built from a database value — is a message Stella knows. */
export function hasMessage(name: string): name is MessageKey {
	return Object.hasOwn(en, name);
}
