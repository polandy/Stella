import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import { circleKindLabel } from './labels';

/*
 * A circle's kind is a closed vocabulary in the domain but plain text in the database
 * (docs/02 §2.4.2), so it is translated by name with the stored value as the fallback.
 */

describe('circleKindLabel', () => {
	it('names a kind Stella knows in the reader’s language', () => {
		expect(circleKindLabel(createTranslator('de'), 'club')).toBe('Verein');
		expect(circleKindLabel(createTranslator('en'), 'club')).toBe('Club');
	});

	it('shows a stored value it has no word for as it stands', () => {
		expect(circleKindLabel(createTranslator('de'), 'kegelclub')).toBe('kegelclub');
	});
});
