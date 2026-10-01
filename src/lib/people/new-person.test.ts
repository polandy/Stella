import { describe, expect, it } from 'bun:test';
import {
	isNameWorthCreating,
	splitTypedName,
	wantsSomethingToKnowThemBy,
	capitalisedIfTypedLowercase,
	isKnownByMoreThanAFirstName,
	newPersonHref,
	readNewPersonRequest
} from './new-person';

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

describe('isKnownByMoreThanAFirstName', () => {
	it('takes a last name, a description, or a whole name typed as one', () => {
		expect(isKnownByMoreThanAFirstName({ firstName: 'Thomas', lastName: 'Widmer' })).toBe(true);
		expect(isKnownByMoreThanAFirstName({ firstName: 'Thomas', description: 'Hut warden' })).toBe(true);
		expect(isKnownByMoreThanAFirstName({ displayName: 'Thomas Widmer' })).toBe(true);
	});

	it('refuses a first name alone, however it is written', () => {
		expect(isKnownByMoreThanAFirstName({ firstName: 'Thomas', lastName: ' ', description: ' ' })).toBe(false);
		expect(isKnownByMoreThanAFirstName({ displayName: 'Thomas' })).toBe(false);
		expect(isKnownByMoreThanAFirstName({})).toBe(false);
	});
});

describe('newPersonHref', () => {
	it('opens the plain form when nothing is asked of it', () => {
		expect(newPersonHref()).toBe('/contacts/new');
		expect(newPersonHref({ name: '  ' })).toBe('/contacts/new');
	});

	it('carries a typed name over, so a search that found nobody becomes the new person', () => {
		expect(newPersonHref({ name: ' Anna Müller ' })).toBe('/contacts/new?name=Anna+M%C3%BCller');
	});

	it('marks the person being added as the member themselves', () => {
		expect(newPersonHref({ self: true })).toBe('/contacts/new?self=1');
	});
});

describe('readNewPersonRequest', () => {
	const read = (href: string) => readNewPersonRequest(new URL(href, 'http://stella.test').searchParams);

	it('reads what newPersonHref wrote', () => {
		expect(read(newPersonHref({ name: 'Lukas van der Berg' }))).toEqual({
			name: { firstName: 'Lukas', lastName: 'van der Berg' },
			isSelf: false
		});
		expect(read(newPersonHref({ self: true }))).toEqual({
			name: { firstName: '', lastName: '' },
			isSelf: true
		});
	});

	it('takes only `self=1` as "this is me", so a stray parameter claims nobody', () => {
		expect(read('/contacts/new?self=1').isSelf).toBe(true);
		expect(read('/contacts/new?self=0').isSelf).toBe(false);
		expect(read('/contacts/new?self').isSelf).toBe(false);
		expect(read('/contacts/new').isSelf).toBe(false);
	});
});
