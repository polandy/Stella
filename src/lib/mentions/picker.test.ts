import { describe, expect, it } from 'bun:test';
import { activeHandle, handleFor, insertHandle, listPlacement, suggest } from './picker';

const people = [
	{ id: 'j', displayName: 'Julia Meier', firstName: 'Julia', lastName: 'Meier' },
	{ id: 'm', displayName: 'Marco Berger', firstName: 'Marco', lastName: 'Berger' },
	{ id: 'n', displayName: 'Mama', firstName: null, lastName: null }
];

describe('activeHandle', () => {
	it('finds the handle ending at the caret', () => {
		expect(activeHandle('met @Ju', 7)).toEqual({ start: 4, query: 'Ju' });
		expect(activeHandle('met @', 5)).toEqual({ start: 4, query: '' });
	});
	it('ignores handles not at the caret, e-mails and escapes', () => {
		expect(activeHandle('met @Julia at', 13)).toBeNull();
		expect(activeHandle('mail anna@ex', 12)).toBeNull();
		expect(activeHandle('literal \\@x', 11)).toBeNull();
	});
});

describe('suggest', () => {
	it('ranks prefix matches on any name part first, then substrings', () => {
		expect(suggest('ma', people).people.map((p) => p.id)).toEqual(['n', 'm']);
		expect(suggest('erg', people).people.map((p) => p.id)).toEqual(['m']);
	});
	it('offers everyone for an empty query and no creation', () => {
		const s = suggest('', people);
		expect(s.people.map((p) => p.id)).toEqual(['j', 'n', 'm']);
		expect(s.create).toBeNull();
	});
	it('offers creation for any typed name, as another one when somebody has it already', () => {
		expect(suggest('Lena', people)).toMatchObject({ create: 'Lena', createsAnother: false });
		// A second Julia Meier is a person like any other (docs/02 §2.2.3).
		expect(suggest('JuliaMeier', people)).toMatchObject({
			create: 'JuliaMeier',
			createsAnother: true
		});
		expect(suggest('mama', people)).toMatchObject({ create: 'mama', createsAnother: true });
		expect(suggest('', people).create).toBeNull();
	});
	it('respects the limit', () => {
		expect(suggest('', people, 2).people).toHaveLength(2);
	});
});

describe('handleFor / insertHandle', () => {
	it('builds @FirstnameLastname, else the display name, letters and digits only', () => {
		expect(handleFor(people[0])).toBe('@JuliaMeier');
		expect(handleFor({ id: 'x', displayName: 'Anne-Marie Ó’Neil' })).toBe('@AnneMarieÓNeil');
	});
	it('splices the handle over the typed fragment and moves the caret after it', () => {
		const r = insertHandle('met @Ju at', { start: 4, query: 'Ju' }, 7, '@JuliaMeier');
		expect(r.text).toBe('met @JuliaMeier  at');
		expect(r.caret).toBe(16);
	});
});

/* The list must stay on screen, also in the phone's composer sheet at the bottom (docs/05). */
describe('listPlacement', () => {
	it('opens below the field when the list fits there', () => {
		expect(listPlacement({ above: 600, below: 300 }, 250)).toEqual({
			side: 'below',
			maxHeight: 300
		});
	});

	it('opens above when it does not fit below and there is more room above', () => {
		expect(listPlacement({ above: 600, below: 120 }, 250)).toEqual({
			side: 'above',
			maxHeight: 600
		});
	});

	it('stays below, scrolling, when below is still the roomier side', () => {
		expect(listPlacement({ above: 100, below: 180 }, 250)).toEqual({
			side: 'below',
			maxHeight: 180
		});
	});
});
