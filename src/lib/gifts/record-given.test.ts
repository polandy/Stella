import { describe, expect, it } from 'bun:test';
import type { PartialDate } from '../dates/partial-date';
import type { When } from '../when/when';
import type { GiftState } from './gifts';
import type { GiverView } from './giver';
import {
	RECORD_FOR_US,
	pastOccasions,
	plannedOfPerson,
	plannedOn,
	recordedCommands,
	rowCounts,
	tickedAtFirst,
	type RecordRow
} from './record-given';

/* *Nachtragen…*: what was given at a passed occasion, several at once (docs/dev/02 §2.25.14). */

const BIRTH: PartialDate = { value: '2019-03-04', precision: 'full' };
const NOBODY: GiverView = { kind: 'none' };
const SANDRA: GiverView = { kind: 'person', contactId: 'sandra', name: 'Sandra' };

describe('the occasions offered', () => {
	it('offers the last Christmas Eve and the last birthday, latest first', () => {
		expect(pastOccasions({ today: '2026-12-27', birth: BIRTH, planned: [] })).toEqual([
			{ on: '2026-12-24', occasion: 'christmas', when: { kind: 'on_date', on: '2026-12-24' } },
			{ on: '2026-03-04', occasion: 'birthday', when: { kind: 'at_age', age: 7 } }
		]);
	});

	it('takes last year’s Christmas before this year’s has come', () => {
		const [christmas] = pastOccasions({ today: '2026-12-23', birth: null, planned: [] });
		expect(christmas.on).toBe('2025-12-24');
	});

	it('counts Christmas Eve itself and a birthday on the day as passed', () => {
		const days = pastOccasions({ today: '2027-03-04', birth: BIRTH, planned: [] });
		expect(days.map((day) => day.on)).toEqual(['2027-03-04', '2026-12-24']);
	});

	it('names a birthday without a year by its day only', () => {
		const birth: PartialDate = { value: '--06-10', precision: 'month_day' };
		const days = pastOccasions({ today: '2026-12-27', birth, planned: [] });
		expect(days[1]).toEqual({ on: '2026-06-10', occasion: 'birthday', when: null });
	});

	it('adds the passed days planned gifts are for, never one still ahead', () => {
		const planned = [
			{ on: '2026-11-01', when: { kind: 'on_date', on: '2026-11-01' } as When },
			{ on: '2027-01-05', when: { kind: 'on_date', on: '2027-01-05' } as When },
			{ on: null, when: null }
		];
		const days = pastOccasions({ today: '2026-11-20', birth: null, planned });
		expect(days.map((day) => [day.on, day.occasion])).toEqual([
			['2026-11-01', null],
			['2025-12-24', 'christmas']
		]);
	});

	it('names a planned birthday or Christmas as such, each day once', () => {
		const planned = [
			{ on: '2026-03-04', when: { kind: 'at_age', age: 7 } as When },
			{ on: '2025-12-24', when: { kind: 'christmas_at_age', age: 6 } as When }
		];
		const days = pastOccasions({ today: '2026-11-20', birth: BIRTH, planned });
		expect(days.map((day) => [day.on, day.occasion])).toEqual([
			['2026-03-04', 'birthday'],
			['2025-12-24', 'christmas']
		]);
	});
});

interface Gift {
	id: string;
	state: GiftState;
	when: When | null;
	giver: GiverView;
}
const gift = (
	id: string,
	state: GiftState,
	when: When | null,
	giver: GiverView = NOBODY
): Gift => ({
	id,
	state,
	when,
	giver
});

describe('what was planned for it', () => {
	const christmas: When = { kind: 'christmas_at_age', age: 7 };
	const gifts = [
		gift('free', 'idea', christmas),
		gift('taken', 'idea', christmas, SANDRA),
		gift('bought', 'bought', { kind: 'on_date', on: '2026-12-24' }),
		gift('given', 'given', christmas),
		gift('other', 'idea', { kind: 'on_date', on: '2026-12-25' }),
		gift('now', 'idea', null)
	];

	it('lists the open and bought gifts for that day', () => {
		expect(plannedOn(gifts, '2026-12-24', BIRTH).map((g) => g.id)).toEqual([
			'free',
			'taken',
			'bought'
		]);
	});

	it('ticks the ones somebody took on or got, not a free idea', () => {
		expect(gifts.filter(tickedAtFirst).map((g) => g.id)).toEqual(['taken', 'bought']);
	});

	it("puts a person's open and bought gifts on their occasion's day, for them", () => {
		const titled = gifts.map((g) => ({ ...g, title: g.id }));
		const planned = plannedOfPerson(titled, { id: 'tomy', name: 'Tomy' }, BIRTH);
		expect(planned.map((g) => [g.id, g.contactId, g.on])).toEqual([
			['free', 'tomy', '2026-12-24'],
			['taken', 'tomy', '2026-12-24'],
			['bought', 'tomy', '2026-12-24'],
			['other', 'tomy', '2026-12-25'],
			['now', 'tomy', null]
		]);
	});
});

const row = (title: string, forId: string, from = ''): RecordRow => ({ title, forId, from });

describe('a row that counts', () => {
	it('needs a title and whom it was for', () => {
		expect(rowCounts(row('Puzzle', 'tomy'))).toBe(true);
		expect(rowCounts(row('  ', 'tomy'))).toBe(false);
		expect(rowCounts(row('Puzzle', ''))).toBe(false);
	});

	it('needs a person as the giver of one to us', () => {
		expect(rowCounts(row('Wine', RECORD_FOR_US, 'sandra'))).toBe(true);
		expect(rowCounts(row('Wine', RECORD_FOR_US, ''))).toBe(false);
		expect(rowCounts(row('Wine', RECORD_FOR_US, 'household'))).toBe(false);
	});
});

describe('the commands it sends', () => {
	const base = { givenOn: '2026-12-24', occasion: 'christmas' };

	it('marks each ticked one given, then notes each row: given, or received from its giver', () => {
		const result = recordedCommands({
			...base,
			planned: [{ contactId: 'tomy', giftId: 'g1' }],
			rows: [
				row('Puzzle', 'tomy', 'sandra'),
				row('Book', 'mia', 'household'),
				row('Wine', RECORD_FOR_US, 'sandra'),
				row('', 'mia')
			]
		});
		expect(result).toEqual({
			ok: true,
			commands: [
				{
					type: 'gift.markGiven',
					payload: { contactId: 'tomy', giftId: 'g1', givenOn: '2026-12-24', occasion: 'christmas' }
				},
				{
					type: 'gift.add',
					payload: {
						contactId: 'tomy',
						state: 'given',
						title: 'Puzzle',
						givenOn: '2026-12-24',
						occasion: 'christmas',
						visibility: 'shared',
						giver: { contactId: 'sandra' }
					}
				},
				{
					type: 'gift.add',
					payload: {
						contactId: 'mia',
						state: 'given',
						title: 'Book',
						givenOn: '2026-12-24',
						occasion: 'christmas',
						visibility: 'shared',
						giver: { household: true }
					}
				},
				{
					type: 'gift.add',
					payload: {
						contactId: 'sandra',
						state: 'received',
						title: 'Wine',
						givenOn: '2026-12-24',
						occasion: 'christmas',
						visibility: 'shared'
					}
				}
			]
		});
	});

	it('refuses a row to us with no person as its giver, and a sheet with nothing in it', () => {
		expect(
			recordedCommands({ ...base, planned: [], rows: [row('Wine', RECORD_FOR_US, '')] })
		).toEqual({ ok: false, reason: 'needGiver' });
		expect(recordedCommands({ ...base, planned: [], rows: [row('', '')] })).toEqual({
			ok: false,
			reason: 'nothing'
		});
	});

	it('refuses a row with a title but nobody it was for', () => {
		expect(recordedCommands({ ...base, planned: [], rows: [row('Puzzle', '')] })).toEqual({
			ok: false,
			reason: 'needRecipient'
		});
	});
});
