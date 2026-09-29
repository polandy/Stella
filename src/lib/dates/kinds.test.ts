import { describe, expect, it } from 'bun:test';
import { isImportantDateKind } from './kinds';

/* Important date kinds (docs/02 §2.13): a form field is one only if the list names it. */

describe('isImportantDateKind', () => {
	it('knows the kinds a date can have, and nothing else', () => {
		expect(isImportantDateKind('birthday')).toBe(true);
		expect(isImportantDateKind('anniversary')).toBe(true);
		expect(isImportantDateKind('nameday')).toBe(false);
		expect(isImportantDateKind('')).toBe(false);
	});
});
