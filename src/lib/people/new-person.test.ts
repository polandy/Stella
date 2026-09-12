import { describe, expect, it } from 'bun:test';
import { isNameWorthCreating, splitTypedName } from './new-person';

describe('splitTypedName', () => {
	it('reads a single word as a first name', () => {
		expect(splitTypedName('Lukas')).toEqual({ firstName: 'Lukas', lastName: '' });
	});

	it('splits two words into first and last name', () => {
		expect(splitTypedName('Lukas Bauer')).toEqual({ firstName: 'Lukas', lastName: 'Bauer' });
	});

	it('keeps a multi-word surname together', () => {
		expect(splitTypedName('Lukas van der Berg')).toEqual({
			firstName: 'Lukas',
			lastName: 'van der Berg'
		});
	});

	it('ignores stray whitespace', () => {
		expect(splitTypedName('  Lukas   Bauer \n')).toEqual({
			firstName: 'Lukas',
			lastName: 'Bauer'
		});
	});

	it('returns empty names for a blank query', () => {
		expect(splitTypedName('   ')).toEqual({ firstName: '', lastName: '' });
	});
});

describe('isNameWorthCreating', () => {
	it('accepts a name long enough to be one', () => {
		expect(isNameWorthCreating('Jo')).toBe(true);
	});

	it('rejects a blank query', () => {
		expect(isNameWorthCreating('   ')).toBe(false);
	});

	it('rejects a single character, which is still mid-typing', () => {
		expect(isNameWorthCreating('L')).toBe(false);
	});
});
