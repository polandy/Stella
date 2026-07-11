import { describe, expect, it } from 'bun:test';
import { deriveDisplayName } from './display-name';

/*
 * Pure derivation of a contact's required, never-empty display name (docs/03 §contact).
 * Priority: explicit name → first+last → first → last → nickname → error.
 */

describe('deriveDisplayName', () => {
	it('uses an explicit display name when given', () => {
		expect(deriveDisplayName({ displayName: 'Bettina von Arx', firstName: 'Bettina' })).toBe(
			'Bettina von Arx'
		);
	});

	it('combines first and last name', () => {
		expect(deriveDisplayName({ firstName: 'Hans', lastName: 'Müller' })).toBe('Hans Müller');
	});

	it('falls back to a single available name part', () => {
		expect(deriveDisplayName({ firstName: 'Hans' })).toBe('Hans');
		expect(deriveDisplayName({ lastName: 'Müller' })).toBe('Müller');
	});

	it('falls back to the nickname when no names are present', () => {
		expect(deriveDisplayName({ nickname: 'Hansi' })).toBe('Hansi');
	});

	it('ignores blank/whitespace values', () => {
		expect(deriveDisplayName({ displayName: '   ', firstName: 'Hans' })).toBe('Hans');
	});

	it('throws when nothing identifies the contact', () => {
		expect(() => deriveDisplayName({})).toThrow();
		expect(() => deriveDisplayName({ firstName: '  ', nickname: '' })).toThrow();
	});
});
