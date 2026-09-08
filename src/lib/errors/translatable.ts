import { inEnglish, type Phrase } from '$lib/i18n/phrase';

/*
 * The base of every domain error whose message a person reads (docs/08 §8.3). The error
 * carries the sentence untranslated: `Error.message` stays English for logs and stack
 * traces, while the edge renders `phrase` in the reader's language.
 */

export class TranslatableError extends Error {
	constructor(
		/** The message, waiting for the reader's language. */
		readonly phrase: Phrase,
		name: string
	) {
		super(inEnglish(phrase));
		this.name = name;
	}
}
