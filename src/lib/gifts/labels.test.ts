import { describe, expect, it } from 'bun:test';
import { createTranslator } from '../i18n/translate';
import { occasionLabel } from './labels';

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
