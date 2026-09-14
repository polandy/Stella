import { describe, expect, it } from 'bun:test';
import { createTranslator } from '$lib/i18n/translate';
import { parentOf, siblingOf } from './reasons';

/*
 * The sentences a suggestion carries (docs/02 §2.19, docs/concepts/relationship-suggestions-
 * implementation.md §6). They leave the domain as a `Phrase` — a key and its names — so the
 * genitive stays in the catalogue of the language that has one, and German can word it its
 * own way.
 */

const en = createTranslator('en');
const de = createTranslator('de');

describe('suggestion reasons', () => {
	it('names the sibling a proposal travels through, in both languages', () => {
		expect(siblingOf('Lisa', 'Hans')(en)).toBe('Lisa is Hans’s sibling.');
		expect(siblingOf('Lisa', 'Hans')(de)).toBe('Lisa ist ein Geschwisterteil von Hans.');
	});

	it('names the parent a proposal travels through, in both languages', () => {
		expect(parentOf('Bettina', 'Hans')(en)).toBe('Bettina is Hans’s parent.');
		expect(parentOf('Bettina', 'Hans')(de)).toBe('Bettina ist ein Elternteil von Hans.');
	});

	it('keeps the English genitive on a name that already ends in s', () => {
		expect(siblingOf('Lisa', 'Lukas')(en)).toBe('Lisa is Lukas’s sibling.');
	});
});
