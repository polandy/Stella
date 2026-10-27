import { describe, expect, it } from 'bun:test';
import { knownLabel } from './import-wording';

/*
 * A label someone typed in Stella goes to the book the way every address book writes it when it
 * is one of the shared words, in whichever language it was typed (docs/02 §2.16.3).
 */
describe('knownLabel', () => {
	it('knows the shared words in every language, whatever their case', () => {
		expect(knownLabel('Home')).toBe('home');
		expect(knownLabel('privat')).toBe('home');
		expect(knownLabel(' Arbeit ')).toBe('work');
		expect(knownLabel('MOBILE')).toBe('mobile');
		expect(knownLabel('Mobil')).toBe('mobile');
	});

	it('leaves any other label as typed', () => {
		expect(knownLabel('Garden house')).toBeNull();
		expect(knownLabel('')).toBeNull();
	});
});
