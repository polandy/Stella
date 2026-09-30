import { describe, expect, it } from 'bun:test';
import { GENDERS, isGender, readGender } from './gender';

describe('the gender vocabulary', () => {
	it('offers female, male and diverse, in the order the chips show them', () => {
		expect(GENDERS).toEqual(['female', 'male', 'diverse']);
	});

	it('knows exactly those three', () => {
		expect(GENDERS.every(isGender)).toBe(true);
		for (const other of ['', 'Female', 'other', 'genderfluid', null, undefined, 1]) {
			expect(isGender(other)).toBe(false);
		}
	});
});

describe('readGender', () => {
	it('reads each of the three back as it was stored', () => {
		for (const gender of GENDERS) expect(readGender(gender)).toBe(gender);
	});

	it('reads nothing on record as nothing', () => {
		expect(readGender(null)).toBeNull();
		expect(readGender('')).toBeNull();
	});

	it('reads a value from before the three, such as one from an old archive, as not on record', () => {
		expect(readGender('genderfluid')).toBeNull();
		expect(readGender('O')).toBeNull();
	});

	it('forgives the casing and spacing an older import may have left', () => {
		expect(readGender(' Female ')).toBe('female');
		expect(readGender('MALE')).toBe('male');
	});
});
