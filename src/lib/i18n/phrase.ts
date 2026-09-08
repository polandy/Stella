import { DEFAULT_LOCALE } from './locales';
import {
	createTranslator,
	type MessageKey,
	type MessageParams,
	type Translate
} from './translate';

/*
 * A sentence that has not been said yet (docs/02 §2.19). Domain code raises errors long
 * before anything knows who will read them, so it carries the message *and its values* as a
 * closure over a translator; the edge renders it in the reader's language.
 */

/** A message plus its values, waiting for a language. */
export type Phrase = (t: Translate) => string;

/** `phrase('errors.date.noSuchDay', { day })` — the key and its values, checked as usual. */
export function phrase<K extends MessageKey>(key: K, ...params: MessageParams<K>): Phrase {
	return (t) => t(key, ...params);
}

/** The English rendering, for `Error.message`, logs and stack traces. */
export function inEnglish(value: Phrase): string {
	return value(createTranslator(DEFAULT_LOCALE));
}
