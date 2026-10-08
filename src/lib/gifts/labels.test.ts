import { describe, expect, it } from 'bun:test';
import { INTL_LOCALES } from '../i18n/locales';
import { createTranslator } from '../i18n/translate';
import { addedLabel, occasionLabel, stateLabel } from './labels';

/*
 * An occasion as the reader reads it (docs/02 §2.25): a preset in their language, whoever
 * chose it; anything typed as it was typed.
 */

describe('occasionLabel', () => {
	it('words a preset in the reader’s language', () => {
		expect(occasionLabel(createTranslator('en'), 'christmas')).toBe('Christmas');
		expect(occasionLabel(createTranslator('de'), 'christmas')).toBe('Weihnachten');
	});

	it('leaves an occasion of the member’s own wording as it was typed', () => {
		expect(occasionLabel(createTranslator('de'), 'Housewarming')).toBe('Housewarming');
	});
});

describe('addedLabel', () => {
	const en = { t: createTranslator('en'), intlLocale: INTL_LOCALES.en };
	const de = { t: createTranslator('de'), intlLocale: INTL_LOCALES.de };
	const thirdOctoberNoonUtc = Date.parse('2026-10-03T12:00:00Z');

	it('says the day the idea was noted, the way the page names a day', () => {
		expect(addedLabel(en, thirdOctoberNoonUtc, 'UTC')).toBe('Added 3 October 2026');
		expect(addedLabel(de, thirdOctoberNoonUtc, 'UTC')).toBe('Notiert am 3. Oktober 2026');
	});

	it('names the day in the reader’s time zone, not the server’s', () => {
		const lateEveningInZurich = Date.parse('2026-10-03T22:30:00Z');
		expect(addedLabel(en, lateEveningInZurich, 'UTC')).toBe('Added 3 October 2026');
		expect(addedLabel(en, lateEveningInZurich, 'Europe/Zurich')).toBe('Added 4 October 2026');
	});
});

describe('stateLabel', () => {
	const en = { t: createTranslator('en'), intlLocale: INTL_LOCALES.en };
	const de = { t: createTranslator('de'), intlLocale: INTL_LOCALES.de };

	it('calls an idea an idea', () => {
		expect(stateLabel(en, { state: 'idea', givenOn: null })).toBe('Idea');
		expect(stateLabel(de, { state: 'idea', givenOn: null })).toBe('Idee');
	});

	it('says on which day a gift was given or received', () => {
		expect(stateLabel(en, { state: 'given', givenOn: '2025-12-24' })).toBe(
			'Given on 24 December 2025'
		);
		expect(stateLabel(de, { state: 'received', givenOn: '2025-12-24' })).toBe(
			'Bekommen am 24. Dezember 2025'
		);
	});
});
