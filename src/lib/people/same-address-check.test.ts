import { describe, expect, test } from 'bun:test';
import {
	findSameAddresses,
	parseSameAddressKey,
	sameAddressKey,
	type SameAddressInput
} from './same-address-check';

const person = (id: string, displayName = id) => ({ id, displayName });

const input = (over: Partial<SameAddressInput> = {}): SameAddressInput => ({
	people: [],
	ownLines: [],
	homes: [],
	dismissals: [],
	...over
});

describe('the dismissal key', () => {
	test('names the people, sorted, and the folded line, and reads back', () => {
		const key = sameAddressKey('lindenweg 4 thalwil', ['b', 'a']);
		expect(key).toBe('a,b lindenweg 4 thalwil');
		expect(parseSameAddressKey(key)).toEqual({
			folded: 'lindenweg 4 thalwil',
			contactIds: ['a', 'b']
		});
	});

	test('a key without a line is not one', () => {
		expect(parseSameAddressKey('a,b')).toBeNull();
		expect(parseSameAddressKey(' lindenweg')).toBeNull();
	});
});

describe('finding people at the same address', () => {
	test('groups own lines equal after folding case, spaces and punctuation', () => {
		const found = findSameAddresses(
			input({
				people: [person('lea', 'Lea Widmer'), person('reto', 'Reto Widmer')],
				ownLines: [
					{ contactId: 'lea', fieldId: 'f1', value: 'Seestrasse 12, 8002 Zürich' },
					{ contactId: 'reto', fieldId: 'f2', value: 'seestrasse 12 · 8002 zürich' }
				]
			})
		);
		expect(found.open).toHaveLength(1);
		expect(found.open[0]).toMatchObject({
			key: 'lea,reto seestrasse 12 8002 zürich',
			line: 'Seestrasse 12, 8002 Zürich',
			home: null,
			people: [
				{ id: 'lea', displayName: 'Lea Widmer', line: 'Seestrasse 12, 8002 Zürich' },
				{ id: 'reto', displayName: 'Reto Widmer', line: 'seestrasse 12 · 8002 zürich' }
			]
		});
	});

	test('a near-match is a different address (Q3)', () => {
		const found = findSameAddresses(
			input({
				people: [person('a'), person('b')],
				ownLines: [
					{ contactId: 'a', fieldId: 'f1', value: 'Dorfstrasse 3, Zug' },
					{ contactId: 'b', fieldId: 'f2', value: 'Dorfstr. 3, Zug' }
				]
			})
		);
		expect(found.open).toEqual([]);
	});

	test('one person with the same line twice is no finding, and counts once in one', () => {
		const lines = [
			{ contactId: 'a', fieldId: 'f1', value: 'Lindenweg 4' },
			{ contactId: 'a', fieldId: 'f2', value: 'lindenweg 4' }
		];
		expect(findSameAddresses(input({ people: [person('a')], ownLines: lines })).open).toEqual([]);

		const found = findSameAddresses(
			input({
				people: [person('a'), person('b')],
				ownLines: [...lines, { contactId: 'b', fieldId: 'f3', value: 'Lindenweg 4' }]
			})
		);
		expect(found.open[0]!.people.map((p) => p.id)).toEqual(['a', 'b']);
	});

	test('a blank or punctuation-only line matches nothing', () => {
		const found = findSameAddresses(
			input({
				people: [person('a'), person('b')],
				ownLines: [
					{ contactId: 'a', fieldId: 'f1', value: ' – ' },
					{ contactId: 'b', fieldId: 'f2', value: '-' }
				]
			})
		);
		expect(found.open).toEqual([]);
	});

	test('a line of someone the viewer may not see is never read', () => {
		const found = findSameAddresses(
			input({
				people: [person('a')],
				ownLines: [
					{ contactId: 'a', fieldId: 'f1', value: 'Lindenweg 4' },
					{ contactId: 'hidden', fieldId: 'f2', value: 'Lindenweg 4' }
				]
			})
		);
		expect(found.open).toEqual([]);
	});

	test('people are ordered by name and findings by line', () => {
		const found = findSameAddresses(
			input({
				people: [person('z', 'Zoe'), person('a', 'Anna'), person('m', 'Mia'), person('b', 'Ben')],
				ownLines: [
					{ contactId: 'z', fieldId: 'f1', value: 'Seeweg 1' },
					{ contactId: 'a', fieldId: 'f2', value: 'Seeweg 1' },
					{ contactId: 'm', fieldId: 'f3', value: 'Bachweg 2' },
					{ contactId: 'b', fieldId: 'f4', value: 'Bachweg 2' }
				]
			})
		);
		expect(found.open.map((f) => f.line)).toEqual(['Bachweg 2', 'Seeweg 1']);
		expect(found.open[1]!.people.map((p) => p.displayName)).toEqual(['Anna', 'Zoe']);
	});
});

describe('a home already at that address', () => {
	const people = [
		person('anna', 'Anna Brunner'),
		person('peter', 'Peter Brunner'),
		person('jonas', 'Jonas Brunner')
	];
	const home = {
		id: 'h1',
		value: 'Lindenweg 4, 8800 Thalwil',
		livesHere: [person('anna', 'Anna Brunner'), person('peter', 'Peter Brunner')]
	};

	test('one own line equal to a home is a finding: join it', () => {
		const found = findSameAddresses(
			input({
				people,
				ownLines: [{ contactId: 'jonas', fieldId: 'f1', value: 'lindenweg 4 8800 thalwil' }],
				homes: [home]
			})
		);
		expect(found.open).toHaveLength(1);
		expect(found.open[0]).toMatchObject({
			line: 'Lindenweg 4, 8800 Thalwil',
			home: { id: 'h1', livesHere: home.livesHere },
			people: [{ id: 'jonas' }]
		});
	});

	test('of two homes with the line, the one more people live in is offered', () => {
		const small = { id: 'h0', value: 'Lindenweg 4, 8800 Thalwil', livesHere: [person('x')] };
		const found = findSameAddresses(
			input({
				people,
				ownLines: [{ contactId: 'jonas', fieldId: 'f1', value: 'Lindenweg 4, 8800 Thalwil' }],
				homes: [small, home]
			})
		);
		expect(found.open[0]!.home!.id).toBe('h1');
	});

	test('a home nobody else has the line of is no finding', () => {
		const found = findSameAddresses(input({ people, homes: [home] }));
		expect(found.open).toEqual([]);
	});
});

describe('Not the same', () => {
	const people = [person('a'), person('b'), person('c')];
	const lines = (...ids: string[]) =>
		ids.map((id) => ({ contactId: id, fieldId: `f-${id}`, value: 'Seeweg 1' }));

	test('a declined group leaves the open list and is listed as declined', () => {
		const key = sameAddressKey('seeweg 1', ['a', 'b']);
		const found = findSameAddresses(
			input({ people, ownLines: lines('a', 'b'), dismissals: [key] })
		);
		expect(found.open).toEqual([]);
		expect(found.declined).toHaveLength(1);
		expect(found.declined[0]).toMatchObject({ line: 'Seeweg 1', dismissedAs: key });
	});

	test('the same group after one of them is gone stays declined', () => {
		const key = sameAddressKey('seeweg 1', ['a', 'b', 'c']);
		const found = findSameAddresses(
			input({ people, ownLines: lines('a', 'b'), dismissals: [key] })
		);
		expect(found.open).toEqual([]);
		expect(found.declined[0]!.dismissedAs).toBe(key);
	});

	test('someone new at the line asks again', () => {
		const found = findSameAddresses(
			input({
				people,
				ownLines: lines('a', 'b', 'c'),
				dismissals: [sameAddressKey('seeweg 1', ['a', 'b'])]
			})
		);
		expect(found.open).toHaveLength(1);
		expect(found.declined).toEqual([]);
	});

	test('an answer for another line does not count', () => {
		const found = findSameAddresses(
			input({
				people,
				ownLines: lines('a', 'b'),
				dismissals: [sameAddressKey('bachweg 2', ['a', 'b']), 'not a key']
			})
		);
		expect(found.open).toHaveLength(1);
	});
});
