import { describe, expect, it } from 'bun:test';
import {
	deriveDisplayName,
	nameWithNickname,
	shownNameIsChosen,
	withNameParts
} from './display-name';

/*
 * Pure derivation of a contact's required, never-empty display name (docs/03 §contact).
 * Priority: explicit name → first+last → first → last → nickname → error.
 */

describe('deriveDisplayName', () => {
	it('uses an explicit display name when given', () => {
		expect(deriveDisplayName({ displayName: 'Bettina von Arx', firstName: 'Bettina' }, 'en')).toBe(
			'Bettina von Arx'
		);
	});

	it('combines first and last name', () => {
		expect(deriveDisplayName({ firstName: 'Hans', lastName: 'Müller' }, 'en')).toBe('Hans Müller');
	});

	it('falls back to a single available name part', () => {
		expect(deriveDisplayName({ firstName: 'Hans' }, 'en')).toBe('Hans');
		expect(deriveDisplayName({ lastName: 'Müller' }, 'en')).toBe('Müller');
	});

	it('falls back to the nickname when no names are present', () => {
		expect(deriveDisplayName({ nickname: 'Hansi' }, 'en')).toBe('Hansi');
	});

	it('ignores blank/whitespace values', () => {
		expect(deriveDisplayName({ displayName: '   ', firstName: 'Hans' }, 'en')).toBe('Hans');
	});

	it('throws when nothing identifies the contact', () => {
		expect(() => deriveDisplayName({}, 'en')).toThrow();
		expect(() => deriveDisplayName({ firstName: '  ', nickname: '' }, 'en')).toThrow();
	});
});

/*
 * The shown name following a changed name part (docs/concepts/surnames.md §6): made again when
 * the parts made it, kept when a member chose it, and never left empty.
 */
describe('withNameParts', () => {
	const thomas = { displayName: 'Thomas', firstName: 'Thomas', lastName: null, nickname: null };

	it('makes the shown name again when the old parts made it', () => {
		expect(withNameParts(thomas, { lastName: 'Brunner' }, 'en')).toEqual({
			displayName: 'Thomas Brunner',
			firstName: 'Thomas',
			lastName: 'Brunner',
			nickname: null
		});
	});

	it('keeps a shown name a member chose', () => {
		const opa = { displayName: 'Opa Hans', firstName: 'Hans', lastName: null, nickname: null };
		expect(withNameParts(opa, { lastName: 'Brunner' }, 'en').displayName).toBe('Opa Hans');
	});

	it('leaves the parts it is not given as they are', () => {
		const tom = {
			displayName: 'Thomas Keller',
			firstName: 'Thomas',
			lastName: 'Keller',
			nickname: 'Tom'
		};
		expect(withNameParts(tom, { lastName: 'Brunner' }, 'en')).toEqual({
			displayName: 'Thomas “Tom” Brunner',
			firstName: 'Thomas',
			lastName: 'Brunner',
			nickname: 'Tom'
		});
	});

	it('trims the parts and stores a blank one as none', () => {
		const tom = {
			displayName: 'Thomas Keller',
			firstName: 'Thomas',
			lastName: 'Keller',
			nickname: null
		};
		expect(
			withNameParts(tom, { firstName: '  Tom ', lastName: '   ', nickname: '' }, 'en')
		).toEqual({
			displayName: 'Tom',
			firstName: 'Tom',
			lastName: null,
			nickname: null
		});
	});

	it('takes the first word of the shown name as the first name when there is none', () => {
		const imported = { displayName: 'Thomas', firstName: null, lastName: null, nickname: null };
		expect(withNameParts(imported, { lastName: 'Brunner' }, 'en')).toEqual({
			displayName: 'Thomas Brunner',
			firstName: 'Thomas',
			lastName: 'Brunner',
			nickname: null
		});
	});

	it('does not guess a first name from a chosen multi-word shown name', () => {
		// "Opa Hans" has no parts yet, so nothing marks it as chosen (shownNameIsChosen is false
		// here too) — but picking "Opa" as the first name would be a worse guess than none.
		const opa = { displayName: 'Opa Hans', firstName: null, lastName: null, nickname: null };
		expect(withNameParts(opa, { lastName: 'Brunner' }, 'en')).toEqual({
			displayName: 'Opa Hans',
			firstName: null,
			lastName: 'Brunner',
			nickname: null
		});
	});

	it('keeps the shown name when every part is emptied', () => {
		const tom = {
			displayName: 'Thomas Keller',
			firstName: 'Thomas',
			lastName: 'Keller',
			nickname: null
		};
		expect(withNameParts(tom, { firstName: '', lastName: '', nickname: '' }, 'en')).toEqual({
			displayName: 'Thomas Keller',
			firstName: null,
			lastName: null,
			nickname: null
		});
	});

	it('follows a nickname when only the nickname made the shown name', () => {
		const hansi = { displayName: 'Hansi', firstName: null, lastName: null, nickname: 'Hansi' };
		expect(withNameParts(hansi, { nickname: 'Hans' }, 'en').displayName).toBe('Hans');
	});
});

describe('shownNameIsChosen', () => {
	it('is false while the parts make the shown name', () => {
		expect(
			shownNameIsChosen({
				displayName: 'Thomas Brunner',
				firstName: 'Thomas',
				lastName: 'Brunner',
				nickname: null
			})
		).toBe(false);
	});

	it('is true for a shown name a member chose', () => {
		expect(
			shownNameIsChosen({
				displayName: 'Opa Hans',
				firstName: 'Hans',
				lastName: 'Brunner',
				nickname: null
			})
		).toBe(true);
	});

	it('is false with no parts at all, which the first parts given will make again', () => {
		expect(
			shownNameIsChosen({ displayName: 'Thomas', firstName: null, lastName: null, nickname: null })
		).toBe(false);
	});
});

/*
 * The nickname in the name it shapes (docs/02 §2.2): *Thomas „Tom“ Brunner*, in the quote marks
 * of the language the name is written in — the stored name is data, so the pair is chosen once,
 * when it is written.
 */
describe('the nickname in the shown name', () => {
	it('sits between first and last name, in the language’s quote marks', () => {
		const tom = { firstName: 'Thomas', lastName: 'Brunner', nickname: 'Tom' };
		expect(deriveDisplayName(tom, 'de')).toBe('Thomas „Tom“ Brunner');
		expect(deriveDisplayName(tom, 'en')).toBe('Thomas “Tom” Brunner');
	});

	it('is left out when it is the first name again, ignoring case and accents', () => {
		expect(
			deriveDisplayName({ firstName: 'René', lastName: 'Keller', nickname: 'rene' }, 'de')
		).toBe('René Keller');
	});

	it('stands in for a missing first name, unquoted', () => {
		expect(deriveDisplayName({ lastName: 'Brunner', nickname: 'Tom' }, 'de')).toBe('Tom Brunner');
		expect(deriveDisplayName({ nickname: 'Tom' }, 'de')).toBe('Tom');
	});

	it('quotes it after a first name alone', () => {
		expect(deriveDisplayName({ firstName: 'Thomas', nickname: 'Tom' }, 'de')).toBe('Thomas „Tom“');
	});

	it('keeps a nickname-less name as before', () => {
		expect(deriveDisplayName({ firstName: 'Thomas', lastName: 'Brunner' }, 'de')).toBe(
			'Thomas Brunner'
		);
	});

	it('follows the parts from a name made by the old rule, writing the new one', () => {
		const old = {
			displayName: 'Thomas Brunner',
			firstName: 'Thomas',
			lastName: 'Brunner',
			nickname: 'Tom'
		};
		expect(shownNameIsChosen(old)).toBe(false);
		expect(withNameParts(old, { lastName: 'Keller' }, 'de').displayName).toBe(
			'Thomas „Tom“ Keller'
		);
	});

	it('reads a name written in either language’s quote marks as following the parts', () => {
		const parts = { firstName: 'Thomas', lastName: 'Brunner', nickname: 'Tom' };
		expect(shownNameIsChosen({ ...parts, displayName: 'Thomas „Tom“ Brunner' })).toBe(false);
		expect(shownNameIsChosen({ ...parts, displayName: 'Thomas “Tom” Brunner' })).toBe(false);
		expect(shownNameIsChosen({ ...parts, displayName: 'Opa Tom' })).toBe(true);
	});
});

describe('nameWithNickname', () => {
	it('gives the new name for a row the old rule made, and null for anything else', () => {
		const row = {
			displayName: 'Thomas Brunner',
			firstName: 'Thomas',
			lastName: 'Brunner',
			nickname: 'Tom'
		};
		expect(nameWithNickname(row, 'de')).toBe('Thomas „Tom“ Brunner');
		expect(nameWithNickname({ ...row, displayName: 'Opa Kurt' }, 'de')).toBeNull();
		expect(nameWithNickname({ ...row, nickname: null }, 'de')).toBeNull();
		expect(nameWithNickname({ ...row, nickname: 'thomas' }, 'de')).toBeNull();
	});
});
