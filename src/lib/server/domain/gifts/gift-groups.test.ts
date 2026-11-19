import { beforeEach, describe, expect, it } from 'bun:test';
import type { PartialDate } from '../../../dates/partial-date';
import { inEnglish } from '../../../i18n/phrase';
import {
	addGiftGroup,
	type AddGiftGroupInput,
	type GiftGroup,
	type GiftGroupDeps
} from './gift-groups';
import { InvalidGiftError, type Gift } from './gifts';

// One idea for several people (docs/dev/02 §2.25.11, ADR-134) over an in-memory port; today is 2026-11-18.

const ANDY = { userId: 'andy', householdId: 'h1' };
const born = (value: string): PartialDate => ({ value, precision: 'full' });
const BIRTHS: Record<string, PartialDate | null> = {
	mia: born('2022-01-20'),
	ben: born('2022-08-02'),
	lea: born('2023-12-28'),
	emma: born('2019-05-10'),
	noah: null,
	andy: born('1985-04-02')
};

let stored: { group: GiftGroup; gifts: readonly Gift[] }[];
let years: { contactId: string; year: string | null }[];
let deps: GiftGroupDeps;
let counter: number;

beforeEach(() => {
	stored = [];
	years = [];
	counter = 0;
	deps = {
		groups: {
			async insert(group, gifts) {
				stored.push({ group, gifts });
			},
			async findVisibleTo() {
				return null;
			},
			async listVisibleTo() {
				return [];
			},
			async listForContactVisibleTo() {
				return [];
			},
			async write() {}
		},
		ownPeople: {
			async memberWhoseOwnPerson(_household, contactId) {
				return contactId === 'andy' ? 'andy' : null;
			}
		},
		contacts: {
			async findByIdVisibleTo(_viewer, id) {
				if (!(id in BIRTHS)) return null;
				const birth = BIRTHS[id];
				return {
					id,
					birthDate: birth?.value ?? null,
					birthDatePrecision: birth?.precision ?? 'full'
				} as never;
			}
		},
		birthYears: {
			async setBirthYear(_viewer, contactId, year) {
				years.push({ contactId, year });
				return true;
			}
		},
		ids: { next: () => `id-${++counter}` },
		clock: { now: () => Date.UTC(2026, 10, 18, 9) }
	};
});

const puzzle = (over: Partial<AddGiftGroupInput> = {}): AddGiftGroupInput => ({
	title: ' Puzzle ',
	note: null,
	url: null,
	when: { kind: 'at_age', age: 5 },
	occasion: 'birthday',
	visibility: 'shared',
	recipients: [{ contactId: 'mia' }, { contactId: 'ben' }, { contactId: 'lea' }],
	...over
});

async function refusal(promise: Promise<unknown>): Promise<string> {
	try {
		await promise;
	} catch (error) {
		if (error instanceof InvalidGiftError) return inEnglish(error.phrase);
		throw error;
	}
	throw new Error('expected a refusal');
}

describe('addGiftGroup', () => {
	it('notes one idea per child, each with the birthday it comes to, bound by the group', async () => {
		const result = await addGiftGroup(deps, ANDY, puzzle());
		expect(result).toEqual({ groupId: 'id-1', giftIds: ['id-2', 'id-3', 'id-4'], skipped: [] });
		const [{ group, gifts }] = stored;
		expect(group).toMatchObject({
			id: 'id-1',
			householdId: 'h1',
			createdBy: 'andy',
			title: 'Puzzle',
			when: { kind: 'at_age', age: 5 },
			occasion: 'birthday',
			visibility: 'shared',
			hiddenFromRecipients: false
		});
		expect(gifts.map((g) => [g.contactId, g.state, g.title, g.groupId, g.when])).toEqual([
			['mia', 'idea', 'Puzzle', 'id-1', { kind: 'at_age', age: 5 }],
			['ben', 'idea', 'Puzzle', 'id-1', { kind: 'at_age', age: 5 }],
			['lea', 'idea', 'Puzzle', 'id-1', { kind: 'at_age', age: 5 }]
		]);
		// The occasion is asked for when each is given, as for any idea.
		expect(gifts.every((g) => g.occasion === null && g.createdBy === 'andy')).toBe(true);
	});

	it('leaves out a child too old for it, one without a birth year and one not to be seen, and says so', async () => {
		const recipients = ['emma', 'noah', 'gone', 'mia'].map((contactId) => ({ contactId }));
		const result = await addGiftGroup(deps, ANDY, puzzle({ recipients }));
		expect(result.skipped).toEqual([
			{ contactId: 'emma', problem: 'birthdayPassed' },
			{ contactId: 'noah', problem: 'needsBirthYear' },
			{ contactId: 'gone', problem: 'gone' }
		]);
		expect(stored[0].gifts.map((g) => g.contactId)).toEqual(['mia']);
	});

	it('keeps an own when for a child too old for the shared one', async () => {
		const nextBirthday = { kind: 'on_date', on: '2027-05-10' } as const;
		await addGiftGroup(
			deps,
			ANDY,
			puzzle({ recipients: [{ contactId: 'emma', when: nextBirthday }] })
		);
		expect(stored[0].gifts[0].when).toEqual(nextBirthday);
		expect(stored[0].group.when).toEqual({ kind: 'at_age', age: 5 });
	});

	it('notes each person once', async () => {
		const result = await addGiftGroup(
			deps,
			ANDY,
			puzzle({ recipients: [{ contactId: 'mia' }, { contactId: 'mia' }] })
		);
		expect(result.giftIds).toHaveLength(1);
	});

	it('stores nothing when nobody is left', async () => {
		const recipients = [{ contactId: 'emma' }, { contactId: 'noah' }];
		expect(await refusal(addGiftGroup(deps, ANDY, puzzle({ recipients })))).toBe(
			'Nobody can get this idea for that time. Choose another.'
		);
		expect(stored).toEqual([]);
	});

	it('needs one to fifty people, a title and a real link', async () => {
		const many = Array.from({ length: 51 }, (_, i) => ({ contactId: `c${i}` }));
		const people = 'Choose who the idea is for — up to 50 people.';
		expect(await refusal(addGiftGroup(deps, ANDY, puzzle({ recipients: [] })))).toBe(people);
		expect(await refusal(addGiftGroup(deps, ANDY, puzzle({ recipients: many })))).toBe(people);
		expect(await refusal(addGiftGroup(deps, ANDY, puzzle({ title: '  ' })))).toBe(
			'A gift needs a name.'
		);
		expect(await refusal(addGiftGroup(deps, ANDY, puzzle({ url: 'not a link' })))).toBe(
			'The link must be a web address.'
		);
		expect(stored).toEqual([]);
	});

	it('keeps a surprise from every person it is for, but never from the author', async () => {
		await addGiftGroup(deps, ANDY, puzzle({ hiddenFromRecipients: true }));
		expect(stored[0].group.hiddenFromRecipients).toBe(true);
		expect(stored[0].gifts.every((g) => g.hiddenFromRecipient)).toBe(true);
		const withAndy = puzzle({
			hiddenFromRecipients: true,
			when: null,
			recipients: [{ contactId: 'mia' }, { contactId: 'andy' }]
		});
		expect(await refusal(addGiftGroup(deps, ANDY, withAndy))).toBe(
			'You cannot keep a gift from yourself — it is for you.'
		);
	});

	it('makes a private idea private for everyone and never a surprise', async () => {
		await addGiftGroup(deps, ANDY, puzzle({ visibility: 'private', hiddenFromRecipients: true }));
		const [{ group, gifts }] = stored;
		expect(group).toMatchObject({ visibility: 'private', hiddenFromRecipients: false });
		expect(gifts.every((g) => g.visibility === 'private' && !g.hiddenFromRecipient)).toBe(true);
	});

	it('works out Christmas at six per child', async () => {
		await addGiftGroup(
			deps,
			ANDY,
			puzzle({ when: { kind: 'christmas_at_age', age: 6 }, occasion: 'christmas' })
		);
		expect(stored[0].gifts.map((g) => g.when)).toEqual(
			Array(3).fill({ kind: 'christmas_at_age', age: 6 })
		);
	});

	it('plans with an estimated birth year and keeps it on the person once noted (D5)', async () => {
		const result = await addGiftGroup(
			deps,
			ANDY,
			puzzle({
				recipients: [
					{ contactId: 'mia', birthYear: '1990' },
					{ contactId: 'noah', birthYear: '2022' }
				]
			})
		);
		expect(result.skipped).toEqual([]);
		expect(stored[0].gifts.map((g) => g.contactId)).toEqual(['mia', 'noah']);
		// Mia's day is on record: her estimate is no estimate and is never written.
		expect(years).toEqual([{ contactId: 'noah', year: '2022' }]);
	});

	it('writes no estimate for a person the when still does not fit, nor when nothing is noted', async () => {
		await addGiftGroup(
			deps,
			ANDY,
			puzzle({
				recipients: [{ contactId: 'mia' }, { contactId: 'noah', birthYear: '2015' }]
			})
		);
		expect(years).toEqual([]);
		await refusal(
			addGiftGroup(deps, ANDY, puzzle({ recipients: [{ contactId: 'noah', birthYear: '2015' }] }))
		);
		expect(years).toEqual([]);
	});

	it('refuses an estimated year no one can be born in', async () => {
		await expect(
			addGiftGroup(deps, ANDY, puzzle({ recipients: [{ contactId: 'noah', birthYear: '2999' }] }))
		).rejects.toThrow();
		expect(stored).toEqual([]);
	});
});
