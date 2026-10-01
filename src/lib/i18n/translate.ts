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

/** Fetches one language's catalogue. */
type CatalogLoader = () => Promise<Messages>;

/** Loading a language, and translating in one that is loaded. */
interface Catalogs {
	/** Makes a language translatable; resolves at once for one already here. */
	loadCatalog(locale: Locale): Promise<void>;
	/**
	 * The translator for one language. A message missing from a translation falls back to
	 * English rather than showing a raw key; a key missing everywhere is a programming error
	 * and throws. So does a language whose catalogue has not been loaded yet: answering in
	 * English instead would be a flash of the wrong language and, in the browser, a
	 * hydration mismatch against the page the server rendered.
	 */
	createTranslator(locale: Locale): Translate;
}

/**
 * A shelf of catalogues: the fallback is always on it, every other language is fetched by
 * its loader the first time it is asked for. Exported for its tests; the app uses the one
 * instance below.
 */
export function createCatalogs(
	fallback: Messages,
	loaders: Partial<Record<Locale, CatalogLoader>>
): Catalogs {
	const loaded = new Map<Locale, Messages>([[DEFAULT_LOCALE, fallback]]);
	const inFlight = new Map<Locale, Promise<void>>();
	const translators = new Map<Locale, Translate>();

	function loadCatalog(locale: Locale): Promise<void> {
		const loader = loaders[locale];
		if (loaded.has(locale) || !loader) return Promise.resolve();
		const pending = inFlight.get(locale);
		if (pending) return pending;

		const loading = loader().then(
			(messages) => {
				loaded.set(locale, messages);
				inFlight.delete(locale);
			},
			(reason: unknown) => {
				// Forget the failure, so the next navigation can try the download again.
				inFlight.delete(locale);
				throw reason;
			}
		);
		inFlight.set(locale, loading);
		return loading;
	}

	function createTranslator(locale: Locale): Translate {
		const cached = translators.get(locale);
		if (cached) return cached;

		const catalog = loaded.get(locale);
		if (!catalog && loaders[locale]) {
			throw new Error(
				`The "${locale}" catalogue is not loaded yet: await loadCatalog('${locale}') first.`
			);
		}
		// A language with no catalogue at all is answered in English wholesale.
		const messages = catalog ?? fallback;
		const translate = (<K extends MessageKey>(key: K, ...params: MessageParams<K>): string => {
			const message = messages[key] ?? fallback[key];
			if (message === undefined) throw new Error(`Unknown message key: ${String(key)}`);
			return typeof message === 'function'
				? (message as (values: unknown) => string)(params[0])
				: message;
		}) as Translate;

		translators.set(locale, translate);
		return translate;
	}

	return { loadCatalog, createTranslator };
}

/*
 * English is imported statically: it is the fallback and the type every other catalogue is
 * checked against, so every page carries it. German is a dynamic import, which the bundler
 * turns into a chunk of its own — downloaded only by a browser that reads German, and before
 * the page hydrates, because the root `+layout.ts` awaits it. The server loads every
 * catalogue once at start-up (`init` in `hooks.server.ts`).
 */
const catalogs = createCatalogs(en, {
	de: () => import('./messages/de').then((module) => module.de)
});

/** Fetches a language's catalogue; `createTranslator` refuses a language until this settles. */
export const loadCatalog = catalogs.loadCatalog;

/** The translator for one language whose catalogue is loaded (English always is). */
export const createTranslator = catalogs.createTranslator;

/** Whether a name — often built from a database value — is a message Stella knows. */
export function hasMessage(name: string): name is MessageKey {
	return Object.hasOwn(en, name);
}
