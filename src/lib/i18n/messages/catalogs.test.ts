import { describe, expect, it } from 'bun:test';
import { de } from './de';
import { en } from './en';

/*
 * The compiler already types each German area module against its English counterpart. This
 * guards the other half: that every area is actually merged into both barrels, so a new
 * module cannot reach production translated but unreachable (or English-only).
 */

describe('message catalogues', () => {
	it('speak the same keys in every language', () => {
		expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
	});

	it('leave no message empty', () => {
		const empty = Object.entries(de).filter(([, value]) => value === '');
		expect(empty).toEqual([]);
	});

	it('translate every message rather than copying the English one', () => {
		// Proper nouns and shared abbreviations are allowed to be identical; a wholesale copy
		// of an area would show up here as a run of untranslated sentences.
		const copied = Object.entries(en).filter(
			([key, value]) =>
				typeof value === 'string' &&
				value.split(' ').length > 3 &&
				de[key as keyof typeof de] === value
		);
		expect(copied).toEqual([]);
	});
});
