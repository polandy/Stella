import { describe, expect, it } from 'bun:test';
import {
	foldName,
	likelyMatchFor,
	matchImmichPeople,
	type MatchableContact,
	type MatchableImmichPerson
} from './match';

/*
 * Matching Stella's people to Immich's by name (docs/02 §2.24.7): a full name that
 * agrees once case and accents are folded is a likely match, a nickname or a first name alone a
 * maybe. The face, not the name, settles who is who — so a doubt is shown, never decided.
 */

const contact = (
	id: string,
	firstName: string | null,
	lastName: string | null,
	extra: Partial<MatchableContact> = {}
): MatchableContact => ({
	id,
	displayName: [firstName, lastName].filter(Boolean).join(' '),
	firstName,
	lastName,
	nickname: null,
	...extra
});

const person = (id: string, name: string, hidden = false): MatchableImmichPerson => ({
	id,
	name,
	hidden
});

const none = new Set<string>();

const match = (
	contacts: MatchableContact[],
	people: MatchableImmichPerson[],
	linked: {
		contacts?: Set<string>;
		people?: Set<string>;
		ignored?: { contactId: string; personId: string }[];
	} = {}
) =>
	matchImmichPeople({
		contacts,
		people,
		linkedContactIds: linked.contacts ?? none,
		linkedPersonIds: linked.people ?? none,
		ignoredPairs: linked.ignored ?? []
	});

describe('foldName', () => {
	it('folds case, accents and the German transliteration onto one spelling', () => {
		expect(foldName('Müller')).toBe(foldName('Mueller'));
		expect(foldName('Müller')).toBe(foldName('muller'));
		expect(foldName('MUELLER')).toBe(foldName('muller'));
		expect(foldName('Strauß')).toBe(foldName('Strauss'));
		expect(foldName('José')).toBe(foldName('jose'));
		expect(foldName('Søren Kierkegård')).toBe(foldName('Soren Kierkegard'));
	});

	it('reads a hyphen, an apostrophe and extra spaces as one space', () => {
		expect(foldName('  Anna-Lena   Brunner ')).toBe(foldName('anna lena brunner'));
		expect(foldName("O'Brien")).toBe(foldName('o brien'));
	});

	it('keeps different names apart', () => {
		expect(foldName('Müller')).not.toBe(foldName('Möller'));
	});
});

describe('matchImmichPeople', () => {
	it('calls a full name that agrees after folding a likely match', () => {
		const rows = match([contact('c1', 'Jürg', 'Müller')], [person('p1', 'Juerg Mueller')]);

		expect(rows).toEqual([
			{ contactId: 'c1', kind: 'likely', candidates: [{ personId: 'p1', strength: 'likely' }] }
		]);
	});

	it('reads the shown name as a full name too', () => {
		const rows = match(
			[contact('c1', 'Rosa', 'Brunner', { displayName: 'Grosi Rosa' })],
			[person('p1', 'Grosi Rosa')]
		);

		expect(rows.map((row) => row.kind)).toEqual(['likely']);
	});

	it('calls a first name alone a maybe', () => {
		const rows = match([contact('c1', 'Lena', 'Brunner')], [person('p1', 'Lena')]);

		expect(rows).toEqual([
			{ contactId: 'c1', kind: 'maybe', candidates: [{ personId: 'p1', strength: 'maybe' }] }
		]);
	});

	it('calls a nickname alone a maybe', () => {
		const rows = match(
			[contact('c1', 'Johannes', 'Brunner', { nickname: 'Hans' })],
			[person('p1', 'Hans')]
		);

		expect(rows.map((row) => row.kind)).toEqual(['maybe']);
	});

	it('calls a nickname with the last name a likely match: it is a full name', () => {
		const rows = match(
			[contact('c1', 'Johannes', 'Brunner', { nickname: 'Hans' })],
			[person('p1', 'Hans Brunner')]
		);

		expect(rows.map((row) => row.kind)).toEqual(['likely']);
	});

	it('calls a full name in Immich a maybe for someone Stella knows by first name only', () => {
		const rows = match([contact('c1', 'Lena', null)], [person('p1', 'Lena Brunner')]);

		expect(rows.map((row) => row.kind)).toEqual(['maybe']);
	});

	it('calls one half of a double last name a maybe', () => {
		const contacts = [
			contact('c1', 'Sandra', 'Brunner-Keller'),
			contact('c2', 'Rosa', 'Brunner Aebi')
		];
		const rows = match(contacts, [person('p1', 'Sandra Brunner'), person('p2', 'Rosa Aebi')]);

		expect(rows.map((row) => [row.contactId, row.kind])).toEqual([
			['c2', 'maybe'],
			['c1', 'maybe']
		]);
	});

	it('does not match a first name alone when both sides name a different family', () => {
		expect(match([contact('c1', 'Lena', 'Brunner')], [person('p1', 'Lena Widmer')])).toEqual([]);
	});

	it('does not match a last name alone', () => {
		expect(match([contact('c1', 'Lena', 'Brunner')], [person('p1', 'Brunner')])).toEqual([]);
	});

	it('skips unnamed and hidden people in Immich', () => {
		const rows = match(
			[contact('c1', 'Lena', 'Brunner')],
			[person('p1', ''), person('p2', 'Lena Brunner', true)]
		);

		expect(rows).toEqual([]);
	});

	it('skips people already linked, on either side', () => {
		const contacts = [contact('c1', 'Lena', 'Brunner'), contact('c2', 'Noah', 'Brunner')];
		const people = [person('p1', 'Lena Brunner'), person('p2', 'Noah Brunner')];

		const rows = match(contacts, people, { contacts: new Set(['c1']), people: new Set(['p2']) });

		expect(rows).toEqual([]);
	});

	it('shows two Immich people with the same name side by side, and asks', () => {
		const rows = match(
			[contact('c1', 'Lena', 'Brunner')],
			[person('p1', 'Lena Brunner'), person('p2', 'Lena Brunner')]
		);

		expect(rows).toEqual([
			{
				contactId: 'c1',
				kind: 'maybe',
				candidates: [
					{ personId: 'p1', strength: 'likely' },
					{ personId: 'p2', strength: 'likely' }
				]
			}
		]);
	});

	it('asks when one Immich person is the likely match of two people in Stella', () => {
		const rows = match(
			[contact('c1', 'Lena', 'Brunner'), contact('c2', 'Lena', 'Brunner')],
			[person('p1', 'Lena Brunner')]
		);

		expect(rows.map((row) => [row.contactId, row.kind])).toEqual([
			['c1', 'maybe'],
			['c2', 'maybe']
		]);
	});

	it('drops the maybes of someone who has a likely match', () => {
		const rows = match(
			[contact('c1', 'Lena', 'Brunner')],
			[person('p1', 'Lena Brunner'), person('p2', 'Lena')]
		);

		expect(rows).toEqual([
			{ contactId: 'c1', kind: 'likely', candidates: [{ personId: 'p1', strength: 'likely' }] }
		]);
	});

	it('offers a face that is someone’s likely match to nobody else as a maybe', () => {
		const rows = match(
			[contact('c1', 'Lena', 'Brunner'), contact('c2', 'Lena', null)],
			[person('p1', 'Lena Brunner')]
		);

		expect(rows.map((row) => row.contactId)).toEqual(['c1']);
	});

	it('never proposes an ignored pair again', () => {
		const rows = match([contact('c1', 'Lena', 'Brunner')], [person('p1', 'Lena Brunner')], {
			ignored: [{ contactId: 'c1', personId: 'p1' }]
		});

		expect(rows).toEqual([]);
	});

	it('ignores a pair, not the face: it is still proposed for someone else', () => {
		const rows = match(
			[contact('c1', 'Lena', 'Brunner'), contact('c2', 'Lena', 'Brunner')],
			[person('p1', 'Lena Brunner')],
			{ ignored: [{ contactId: 'c1', personId: 'p1' }] }
		);

		// With c1's doubt gone, the face is c2's alone — a likely match again.
		expect(rows).toEqual([
			{ contactId: 'c2', kind: 'likely', candidates: [{ personId: 'p1', strength: 'likely' }] }
		]);
	});

	it('shows the maybes of someone whose likely match was ignored', () => {
		const rows = match(
			[contact('c1', 'Lena', 'Brunner')],
			[person('p1', 'Lena Brunner'), person('p2', 'Lena')],
			{
				ignored: [{ contactId: 'c1', personId: 'p1' }]
			}
		);

		expect(rows).toEqual([
			{ contactId: 'c1', kind: 'maybe', candidates: [{ personId: 'p2', strength: 'maybe' }] }
		]);
	});

	it('lists the likely matches first, each part in name order', () => {
		const rows = match(
			[
				contact('c1', 'Noah', 'Brunner'),
				contact('c2', 'Elias', 'Brunner'),
				contact('c3', 'Mia', 'Widmer'),
				contact('c4', 'Anna', 'Keller')
			],
			[
				person('p1', 'Noah Brunner'),
				person('p2', 'Elias Brunner'),
				person('p3', 'Mia'),
				person('p4', 'Anna')
			]
		);

		expect(rows.map((row) => row.contactId)).toEqual(['c2', 'c1', 'c4', 'c3']);
	});
});

describe('likelyMatchFor', () => {
	const lena = contact('c-lena', 'Lena', 'Brunner');
	const timo = contact('c-timo', 'Timo', 'Brunner');

	it('gives the one face a likely row proposes for that person', () => {
		const rows = match([lena, timo], [person('p-lena', 'Lena Brunner'), person('p-timo', 'Timo')]);

		expect(likelyMatchFor(rows, 'c-lena')).toBe('p-lena');
	});

	it('gives nothing for a maybe — the settings list asks about those', () => {
		const rows = match([lena, timo], [person('p-lena', 'Lena Brunner'), person('p-timo', 'Timo')]);

		expect(rows.some((row) => row.contactId === 'c-timo' && row.kind === 'maybe')).toBe(true);
		expect(likelyMatchFor(rows, 'c-timo')).toBeNull();
	});

	it('gives nothing when two faces carry the full name, as the list makes that a maybe', () => {
		const rows = match([lena], [person('p-1', 'Lena Brunner'), person('p-2', 'Lena Brunner')]);

		expect(rows).toHaveLength(1);
		expect(likelyMatchFor(rows, 'c-lena')).toBeNull();
	});

	it('gives nothing for a person no row is about', () => {
		const rows = match([lena], [person('p-lena', 'Lena Brunner')]);

		expect(likelyMatchFor(rows, 'c-lena')).toBe('p-lena');
		expect(likelyMatchFor(rows, 'c-timo')).toBeNull();
	});
});
