import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import { phrase } from '$lib/i18n/phrase';
import { TranslatableError } from './translatable';

/*
 * A domain refusal travels without a language (docs/02 §2.19): it carries the message and
 * its values, the edge says them. `Error.message` stays English so a log reads the same
 * everywhere, whoever hit the error.
 */

class DateRefused extends TranslatableError {
	constructor(day: string) {
		super(phrase('errors.date.noSuchDay', { day }), 'DateRefused');
	}
}

describe('TranslatableError', () => {
	it('reads in the language the edge asks for', () => {
		const err = new DateRefused('2026-02-30');

		expect(err.phrase(createTranslator('de'))).toBe(
			'Diesen Tag gibt es im Kalender nicht: 2026-02-30.'
		);
		expect(err.phrase(createTranslator('en'))).toBe(
			'There is no such day in the calendar: 2026-02-30.'
		);
	});

	it('keeps an English message and its name for logs and stack traces', () => {
		const err = new DateRefused('2026-02-30');

		expect(err.message).toBe('There is no such day in the calendar: 2026-02-30.');
		expect(err.name).toBe('DateRefused');
		expect(err instanceof Error).toBe(true);
	});
});
