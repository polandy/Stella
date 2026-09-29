import { describe, expect, it } from 'bun:test';
import { isNameWorthCreating, splitTypedName, wantsSomethingToKnowThemBy, capitalisedIfTypedLowercase } from './new-person';

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

describe('wantsSomethingToKnowThemBy', () => {
	it('asks once a first name stands without a last name', () => {
		expect(wantsSomethingToKnowThemBy({ firstName: 'Thomas', lastName: '' })).toBe(true);
		expect(wantsSomethingToKnowThemBy({ firstName: 'Thomas', lastName: '   ' })).toBe(true);
	});

	it('stays quiet once there is a last name', () => {
		expect(wantsSomethingToKnowThemBy({ firstName: 'Thomas', lastName: 'Meier' })).toBe(false);
	});

	it('stays quiet while nothing is typed yet', () => {
		expect(wantsSomethingToKnowThemBy({ firstName: ' ', lastName: '' })).toBe(false);
	});
});

describe('capitalisedIfTypedLowercase', () => {
	it('capitalises a name typed all in lowercase, as a handle on a phone usually is', () => {
		expect(capitalisedIfTypedLowercase('thomas')).toBe('Thomas');
		expect(capitalisedIfTypedLowercase('élise')).toBe('Élise');
	});

	it('leaves a name alone once its writer has capitalised any of it', () => {
		expect(capitalisedIfTypedLowercase('McKenzie')).toBe('McKenzie');
		expect(capitalisedIfTypedLowercase('deVries')).toBe('deVries');
		expect(capitalisedIfTypedLowercase('')).toBe('');
	});
});
