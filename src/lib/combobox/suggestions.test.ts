import { describe, expect, it } from 'bun:test';
import { filterSuggestions } from './suggestions';

/*
 * A free-text field that offers a short list of existing values (a circle's roles, a household's
 * circle names, …) without forcing a pick — typing something new is always allowed.
 */

describe('filterSuggestions', () => {
	it('offers everything on an empty query, so opening the field shows what already exists', () => {
		expect(filterSuggestions('', ['Vorstand', 'Trainer'])).toEqual(['Vorstand', 'Trainer']);
	});

	it('keeps only values containing the query, case-insensitively', () => {
		expect(filterSuggestions('vor', ['Vorstand', 'Trainer', 'Vorlesen'])).toEqual([
			'Vorstand',
			'Vorlesen'
		]);
	});

	it('puts a value that starts with the query before one that merely contains it', () => {
		expect(filterSuggestions('trainer', ['Co-Trainer', 'Trainer'])).toEqual([
			'Trainer',
			'Co-Trainer'
		]);
	});

	it('is empty once nothing matches, so a wholly new value is offered no stale suggestions', () => {
		expect(filterSuggestions('zzz', ['Vorstand', 'Trainer'])).toEqual([]);
	});

	it('ignores surrounding whitespace in the query', () => {
		expect(filterSuggestions('  vor  ', ['Vorstand', 'Trainer'])).toEqual(['Vorstand']);
	});
});
