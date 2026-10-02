import { describe, expect, it } from 'bun:test';
import { deriveDisplayName, shownNameIsChosen, withNameParts } from './display-name';

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

/*
 * The shown name following a changed name part (docs/concepts/surnames.md §6): made again when
 * the parts made it, kept when a member chose it, and never left empty.
 */
describe('withNameParts', () => {
	const thomas = { displayName: 'Thomas', firstName: 'Thomas', lastName: null, nickname: null };

	it('makes the shown name again when the old parts made it', () => {
		expect(withNameParts(thomas, { lastName: 'Brunner' })).toEqual({
			displayName: 'Thomas Brunner',
			firstName: 'Thomas',
			lastName: 'Brunner',
			nickname: null
		});
	});

	it('keeps a shown name a member chose', () => {
		const opa = { displayName: 'Opa Hans', firstName: 'Hans', lastName: null, nickname: null };
		expect(withNameParts(opa, { lastName: 'Brunner' }).displayName).toBe('Opa Hans');
	});

	it('leaves the parts it is not given as they are', () => {
		const tom = { displayName: 'Thomas Keller', firstName: 'Thomas', lastName: 'Keller', nickname: 'Tom' };
		expect(withNameParts(tom, { lastName: 'Brunner' })).toEqual({
			displayName: 'Thomas Brunner',
			firstName: 'Thomas',
			lastName: 'Brunner',
			nickname: 'Tom'
		});
	});

	it('trims the parts and stores a blank one as none', () => {
		const tom = { displayName: 'Thomas Keller', firstName: 'Thomas', lastName: 'Keller', nickname: null };
		expect(withNameParts(tom, { firstName: '  Tom ', lastName: '   ', nickname: '' })).toEqual({
			displayName: 'Tom',
			firstName: 'Tom',
			lastName: null,
			nickname: null
		});
	});

	it('takes the first word of the shown name as the first name when there is none', () => {
		const imported = { displayName: 'Thomas', firstName: null, lastName: null, nickname: null };
		expect(withNameParts(imported, { lastName: 'Brunner' })).toEqual({
			displayName: 'Thomas Brunner',
			firstName: 'Thomas',
			lastName: 'Brunner',
			nickname: null
		});
	});

	it('keeps the shown name when every part is emptied', () => {
		const tom = { displayName: 'Thomas Keller', firstName: 'Thomas', lastName: 'Keller', nickname: null };
		expect(withNameParts(tom, { firstName: '', lastName: '', nickname: '' })).toEqual({
			displayName: 'Thomas Keller',
			firstName: null,
			lastName: null,
			nickname: null
		});
	});

	it('follows a nickname when only the nickname made the shown name', () => {
		const hansi = { displayName: 'Hansi', firstName: null, lastName: null, nickname: 'Hansi' };
		expect(withNameParts(hansi, { nickname: 'Hans' }).displayName).toBe('Hans');
	});
});

describe('shownNameIsChosen', () => {
	it('is false while the parts make the shown name', () => {
		expect(shownNameIsChosen({ displayName: 'Thomas Brunner', firstName: 'Thomas', lastName: 'Brunner', nickname: null })).toBe(false);
	});

	it('is true for a shown name a member chose', () => {
		expect(shownNameIsChosen({ displayName: 'Opa Hans', firstName: 'Hans', lastName: 'Brunner', nickname: null })).toBe(true);
	});

	it('is false with no parts at all, which the first parts given will make again', () => {
		expect(shownNameIsChosen({ displayName: 'Thomas', firstName: null, lastName: null, nickname: null })).toBe(false);
	});
});
