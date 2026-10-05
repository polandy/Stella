import { describe, expect, it } from 'bun:test';
import { immichNewcomers, mostPhotosFirst, newPersonFromImmichName } from './newcomers';

const person = (id: string, name: string, hidden = false) => ({ id, name, hidden });
const none = new Set<string>();

describe('immichNewcomers', () => {
	const base = { heldPersonIds: none, proposedPersonIds: none, ignoredPersonIds: none };

	it('lists the named faces nobody in Stella holds or is proposed for, in the order Immich gave them', () => {
		const rows = immichNewcomers({
			...base,
			people: [person('p2', 'Silvan Kunz'), person('p1', 'Martina Gerber'), person('p3', 'Ägidius Abt')]
		});
		expect(rows).toEqual([
			{ personId: 'p2', name: 'Silvan Kunz' },
			{ personId: 'p1', name: 'Martina Gerber' },
			{ personId: 'p3', name: 'Ägidius Abt' }
		]);
	});

	it('never lists a hidden or unnamed face', () => {
		const rows = immichNewcomers({
			...base,
			people: [person('p1', 'Martina Gerber', true), person('p2', ''), person('p3', '   '), person('p4', 'Grosi')]
		});
		expect(rows.map((r) => r.personId)).toEqual(['p4']);
	});

	it('leaves out a face someone holds, even someone the member cannot see', () => {
		const rows = immichNewcomers({
			...base,
			people: [person('p1', 'Martina Gerber'), person('p2', 'Silvan Kunz')],
			heldPersonIds: new Set(['p1'])
		});
		expect(rows.map((r) => r.personId)).toEqual(['p2']);
	});

	it('leaves out a face *Find your people* proposes for somebody, so nobody is in both tabs', () => {
		const rows = immichNewcomers({
			...base,
			people: [person('p1', 'Timo'), person('p2', 'Silvan Kunz')],
			proposedPersonIds: new Set(['p1'])
		});
		expect(rows.map((r) => r.personId)).toEqual(['p2']);
	});

	it('leaves out a face the household ignored', () => {
		const rows = immichNewcomers({
			...base,
			people: [person('p1', 'Martina Gerber'), person('p2', 'Silvan Kunz')],
			ignoredPersonIds: new Set(['p2'])
		});
		expect(rows.map((r) => r.personId)).toEqual(['p1']);
	});

	it('shows the name as Immich writes it, without stray spaces', () => {
		expect(immichNewcomers({ ...base, people: [person('p1', '  Martina   Gerber ')] })).toEqual([
			{ personId: 'p1', name: 'Martina Gerber' }
		]);
	});
});

describe('mostPhotosFirst', () => {
	const row = (personId: string, name: string, photoCount: number | null) => ({ personId, name, photoCount });

	it('puts the people with the most photos first', () => {
		const rows = [row('p1', 'Sandra', 19), row('p2', 'Lena Köhler', 212), row('p3', 'Opa Manfred', 87)];
		expect(mostPhotosFirst(rows).map((r) => r.personId)).toEqual(['p2', 'p3', 'p1']);
	});

	it('puts a face without a count last, and orders a tie by name, then by id', () => {
		const rows = [row('p9', 'Bea', null), row('p4', 'Cleo', 5), row('p3', 'Ägidius', 5), row('p1', 'Cleo', 5)];
		expect(mostPhotosFirst(rows).map((r) => r.personId)).toEqual(['p3', 'p1', 'p4', 'p9']);
	});

	it('leaves the rows it was given as they were', () => {
		const rows = [row('p1', 'Sandra', 1), row('p2', 'Lena', 2)];
		mostPhotosFirst(rows);
		expect(rows.map((r) => r.personId)).toEqual(['p1', 'p2']);
	});
});

describe('newPersonFromImmichName', () => {
	it('takes the first word as the first name and the rest as the last name', () => {
		expect(newPersonFromImmichName('Anna van der Berg')).toEqual({
			firstName: 'Anna',
			lastName: 'van der Berg',
			nickname: ''
		});
	});

	it('leaves the last name empty for a single name', () => {
		expect(newPersonFromImmichName(' Sandra ')).toEqual({ firstName: 'Sandra', lastName: '', nickname: '' });
	});

	it('reads a leading kin word as the nickname, in German and in English', () => {
		expect(newPersonFromImmichName('Opa Manfred')).toEqual({ firstName: 'Manfred', lastName: '', nickname: 'Opa' });
		expect(newPersonFromImmichName('Tante Lotte Brunner')).toEqual({
			firstName: 'Lotte',
			lastName: 'Brunner',
			nickname: 'Tante'
		});
		expect(newPersonFromImmichName('grandma Rose')).toEqual({ firstName: 'Rose', lastName: '', nickname: 'grandma' });
		expect(newPersonFromImmichName('Uncle Bob')).toEqual({ firstName: 'Bob', lastName: '', nickname: 'Uncle' });
	});

	it('keeps a kin word that is the whole name as the first name', () => {
		expect(newPersonFromImmichName('Oma')).toEqual({ firstName: 'Oma', lastName: '', nickname: '' });
	});

	it('does not take a trailing initial for a last name', () => {
		expect(newPersonFromImmichName('Jonas B.')).toEqual({ firstName: 'Jonas', lastName: '', nickname: '' });
		expect(newPersonFromImmichName('Jonas B')).toEqual({ firstName: 'Jonas', lastName: '', nickname: '' });
		expect(newPersonFromImmichName('Jonas Bo')).toEqual({ firstName: 'Jonas', lastName: 'Bo', nickname: '' });
	});
});
