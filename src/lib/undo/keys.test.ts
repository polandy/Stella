import { describe, expect, it } from 'bun:test';
import { removalKey, REMOVAL_KINDS } from './keys';

/*
 * Every deferred removal is identified by one key, built here (docs/02 §2.23). The key is
 * what a list checks to hide a row, so two different things must never produce the same one.
 */

describe('removalKey', () => {
	it('names the kind and the id, so a row can ask whether it is on its way out', () => {
		expect(removalKey('field', 'f-1')).toBe('field:f-1');
	});

	it('keeps the same id apart across kinds — a tag and a date can share an id', () => {
		expect(removalKey('tag', 'x')).not.toBe(removalKey('date', 'x'));
	});

	it('gives every kind a key that differs from every other', () => {
		const keys = REMOVAL_KINDS.map((kind) => removalKey(kind, 'same-id'));
		expect(new Set(keys).size).toBe(REMOVAL_KINDS.length);
	});
});
