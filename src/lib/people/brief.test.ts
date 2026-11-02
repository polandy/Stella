import { describe, expect, it } from 'bun:test';
import {
	briefBlocks,
	closeFamily,
	LATELY_COUNT,
	nextDateAmong,
	type BriefParts,
	type BriefTie,
	type BirthdaySource
} from './brief';

/*
 * A person's brief (docs/02 §2.2.5): who belongs to them and how old they are, which blocks
 * stand on it and in what order, and that an empty one is left out rather than shown bare.
 */

const TODAY = '2026-11-02';

const tie = (over: Partial<BriefTie> & Pick<BriefTie, 'otherContactId' | 'typeKey'>): BriefTie => ({
	otherDisplayName: over.otherContactId,
	side: 'forward',
	status: 'current',
	...over
});

const birthday = (contactId: string, date: string, over: Partial<BirthdaySource> = {}) => ({
	contactId,
	kind: 'birthday',
	date,
	derived: true,
	isDeceased: false,
	...over
});

describe('closeFamily', () => {
	it('names the partner and the children, each worded from the gender on record, with an age', () => {
		const family = closeFamily(
			{
				ties: [
					tie({ otherContactId: 'ben', typeKey: 'spouse' }),
					// Anna is the forward end of parent_child: the parent, so Mia is her child.
					tie({ otherContactId: 'mia', typeKey: 'parent_child', side: 'forward' })
				],
				tieWording: { ben: 'male', mia: 'female' },
				derivedKin: [],
				birthdays: [birthday('ben', '1976-05-01'), birthday('mia', '2013-11-14')]
			},
			TODAY
		);
		expect(family).toEqual([
			{ id: 'ben', name: 'ben', role: 'spouse', variant: 'male', age: 50, deceased: false },
			{ id: 'mia', name: 'mia', role: 'child', variant: 'female', age: 12, deceased: false }
		]);
	});

	it('puts the partners first, then the children oldest first, those of unknown age last', () => {
		const family = closeFamily(
			{
				ties: [
					tie({ otherContactId: 'leo', typeKey: 'parent_child' }),
					tie({ otherContactId: 'zoe', typeKey: 'parent_child' }),
					tie({ otherContactId: 'mia', typeKey: 'parent_child' }),
					tie({ otherContactId: 'ben', typeKey: 'partner' })
				],
				tieWording: {},
				derivedKin: [],
				birthdays: [birthday('leo', '2017-03-01'), birthday('mia', '2013-11-14')]
			},
			TODAY
		);
		expect(family.map((member) => member.id)).toEqual(['ben', 'mia', 'leo', 'zoe']);
		expect(family[0].variant).toBe('neutral');
	});

	it('leaves out an ended partnership, a parent, and anyone who is not family', () => {
		const family = closeFamily(
			{
				ties: [
					tie({ otherContactId: 'ex', typeKey: 'spouse', status: 'former' }),
					// From this side Anna is the child: the other end is her parent.
					tie({ otherContactId: 'mum', typeKey: 'parent_child', side: 'reverse' }),
					tie({ otherContactId: 'pal', typeKey: 'friend' }),
					tie({ otherContactId: 'own', typeKey: 'godparent' })
				],
				tieWording: {},
				derivedKin: [],
				birthdays: []
			},
			TODAY
		);
		expect(family).toEqual([]);
	});

	it('counts a worked-out stepchild among the children', () => {
		const family = closeFamily(
			{
				ties: [tie({ otherContactId: 'mia', typeKey: 'parent_child' })],
				tieWording: {},
				derivedKin: [
					{ personId: 'tom', displayName: 'Tom', term: 'step-child', variant: 'male' },
					{ personId: 'gran', displayName: 'Gran', term: 'grandparent', variant: 'female' }
				],
				birthdays: [birthday('tom', '2010-01-01'), birthday('mia', '2013-11-14')]
			},
			TODAY
		);
		expect(family.map(({ id, role }) => [id, role])).toEqual([
			['tom', 'step-child'],
			['mia', 'child']
		]);
	});

	it('names somebody tied twice only once, by the closer word', () => {
		const family = closeFamily(
			{
				ties: [
					tie({ otherContactId: 'ben', typeKey: 'partner' }),
					tie({ otherContactId: 'ben', typeKey: 'spouse' })
				],
				tieWording: {},
				derivedKin: [],
				birthdays: []
			},
			TODAY
		);
		expect(family.map(({ id, role }) => [id, role])).toEqual([['ben', 'spouse']]);
	});

	it('reads the age off an entered birthday before the profile’s, and gives none without a year', () => {
		const family = closeFamily(
			{
				ties: [
					tie({ otherContactId: 'mia', typeKey: 'parent_child' }),
					tie({ otherContactId: 'leo', typeKey: 'parent_child' })
				],
				tieWording: {},
				derivedKin: [],
				birthdays: [
					birthday('mia', '2010-11-14'),
					birthday('mia', '2013-11-14', { derived: false }),
					birthday('leo', '--03-01')
				]
			},
			TODAY
		);
		expect(family.map(({ id, age }) => [id, age])).toEqual([
			['mia', 12],
			['leo', null]
		]);
	});

	it('says a member has died rather than how old they would be', () => {
		const [ben] = closeFamily(
			{
				ties: [tie({ otherContactId: 'ben', typeKey: 'spouse' })],
				tieWording: {},
				derivedKin: [],
				birthdays: [birthday('ben', '1950-01-01', { isDeceased: true })]
			},
			TODAY
		);
		expect(ben).toMatchObject({ deceased: true, age: null });
	});
});

describe('nextDateAmong', () => {
	const ahead = [
		{ contactId: 'stranger', date: '2026-11-03' },
		{ contactId: 'mia', date: '2026-11-14' },
		{ contactId: 'anna', date: '2027-03-03' }
	];

	it('is the nearest date of the person or of their family, nobody else’s', () => {
		expect(nextDateAmong(ahead, ['anna', 'mia'])).toEqual({ contactId: 'mia', date: '2026-11-14' });
		expect(nextDateAmong(ahead, ['anna'])).toEqual({ contactId: 'anna', date: '2027-03-03' });
	});

	it('is none when nothing of theirs lies ahead', () => {
		expect(nextDateAmong(ahead, ['leo'])).toBeNull();
	});
});

type Rows = {
	next: string;
	home: string;
	note: { id: string; isPinned: boolean };
	moment: { id: string; kind: string };
	todo: string;
	idea: { id: string; state: string };
};

const nothing: BriefParts<Rows> = {
	next: null,
	family: [],
	homes: [],
	notes: [],
	story: [],
	todos: [],
	gifts: [],
	met: null
};

const member = {
	id: 'ben',
	name: 'Ben',
	role: 'spouse',
	variant: 'male',
	age: 50,
	deceased: false
} as const;

describe('briefBlocks', () => {
	it('stands every block in its order: next, family and home, notes, lately, to do, gifts, how we met', () => {
		const blocks = briefBlocks<Rows>({
			next: 'Mia turns 13',
			family: [member],
			homes: ['Lindenstraße 4'],
			notes: [{ id: 'n1', isPinned: true }],
			story: [{ id: 'j1', kind: 'journal' }],
			todos: ['Give back the drill'],
			gifts: [{ id: 'g1', state: 'idea' }],
			met: 'At university'
		});
		expect(blocks.map((block) => block.kind)).toEqual([
			'next',
			'family',
			'notes',
			'lately',
			'todos',
			'gifts',
			'met'
		]);
	});

	it('leaves every empty block out, so a person with nothing on record has an empty brief', () => {
		expect(briefBlocks<Rows>(nothing)).toEqual([]);
	});

	it('keeps the family card for a home alone, and for family alone', () => {
		expect(briefBlocks<Rows>({ ...nothing, homes: ['Lindenstraße 4'] })).toEqual([
			{ kind: 'family', members: [], homes: ['Lindenstraße 4'] }
		]);
		expect(briefBlocks<Rows>({ ...nothing, family: [member] })).toEqual([
			{ kind: 'family', members: [member], homes: [] }
		]);
	});

	it('takes only the pinned notes', () => {
		const blocks = briefBlocks<Rows>({
			...nothing,
			notes: [
				{ id: 'n1', isPinned: false },
				{ id: 'n2', isPinned: true }
			]
		});
		expect(blocks).toEqual([{ kind: 'notes', notes: [{ id: 'n2', isPinned: true }] }]);
		expect(briefBlocks<Rows>({ ...nothing, notes: [{ id: 'n1', isPinned: false }] })).toEqual([]);
	});

	it('takes the latest moments and touchpoints, not the gifts or to-dos of the story', () => {
		const story = [
			{ id: 'g', kind: 'gift' },
			{ id: 'j1', kind: 'journal' },
			{ id: 't', kind: 'todo' },
			{ id: 'i1', kind: 'interaction' },
			{ id: 'j2', kind: 'journal' },
			{ id: 'j3', kind: 'journal' }
		];
		const [lately] = briefBlocks<Rows>({ ...nothing, story });
		expect(lately).toEqual({
			kind: 'lately',
			items: [
				{ id: 'j1', kind: 'journal' },
				{ id: 'i1', kind: 'interaction' },
				{ id: 'j2', kind: 'journal' }
			]
		});
		expect(LATELY_COUNT).toBe(3);
	});

	it('takes only the open gift ideas, not what was given or received', () => {
		const blocks = briefBlocks<Rows>({
			...nothing,
			gifts: [
				{ id: 'g1', state: 'given' },
				{ id: 'g2', state: 'idea' },
				{ id: 'g3', state: 'received' }
			]
		});
		expect(blocks).toEqual([{ kind: 'gifts', ideas: [{ id: 'g2', state: 'idea' }] }]);
	});
});
