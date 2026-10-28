import { describe, expect, it } from 'bun:test';
import { searchedTag, toFtsQuery } from './query';

/*
 * Turn free user input into a safe FTS5 MATCH expression (docs/02 §2.9): per-token prefix
 * search, with special characters stripped and operator keywords neutralised (lowercased).
 */

describe('toFtsQuery', () => {
	it('makes each token a prefix match', () => {
		expect(toFtsQuery('Hans')).toBe('hans*');
		expect(toFtsQuery('Hans Mül')).toBe('hans* mül*');
	});

	it('strips FTS syntax and neutralises operators', () => {
		expect(toFtsQuery('a" OR (b)')).toBe('a* or* b*');
	});

	it('returns an empty string for blank input', () => {
		expect(toFtsQuery('   ')).toBe('');
		expect(toFtsQuery('!!! ??? ')).toBe('');
	});
});

describe('searchedTag', () => {
	it('reads an input that is one #tag as the tag’s key', () => {
		expect(searchedTag('#Hike')).toBe('hike');
		expect(searchedTag('  #Bärg-Tour ')).toBe('bärg-tour');
	});

	it('is null for words, several tags, or a # that is no tag', () => {
		expect(searchedTag('hike')).toBeNull();
		expect(searchedTag('#hike #lake')).toBeNull();
		expect(searchedTag('#hike lake')).toBeNull();
		expect(searchedTag('#2024')).toBeNull();
		expect(searchedTag('#')).toBeNull();
	});
});
