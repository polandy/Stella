import {
	createTranslator,
	type MessageKey,
	type MessageParams,
	type Translate
} from '$lib/i18n/translate';

/*
 * What a route says back to the browser, in the language of the request (docs/02 §2.19).
 * The edge is where a message stops being a key and becomes a sentence: `locals.locale` was
 * settled once in `hooks.server.ts`, and every action, endpoint and `error()` renders through
 * here rather than reaching for a translator of its own.
 */

/** `say(locals, 'errors.contact.notFound')` — one message, in the reader's language. */
export function say<K extends MessageKey>(
	locals: App.Locals,
	key: K,
	...params: MessageParams<K>
): string {
	return createTranslator(locals.locale)(key, ...params);
}

/** The translator itself, for a message a domain error is already carrying as a `Phrase`. */
export function translator(locals: App.Locals): Translate {
	return createTranslator(locals.locale);
}
