import { describe, expect, test } from 'bun:test';
import {
	UPCOMING_HORIZON_DAYS,
	UPCOMING_LIMIT,
	upcomingDates,
	type UpcomingSource
} from './upcoming';

const TODAY = '2026-09-04';

function source(over: Partial<UpcomingSource> = {}): UpcomingSource {
	return {
		contactId: 'c1',
		contactName: 'Lena Brunner',
		avatarPhotoId: null,
		isDeceased: false,
		kind: 'birthday',
		label: null,
		date: '2015-09-20',
		recursYearly: true,
		remind: true,
		derived: true,
		...over
	};
}

describe('upcomingDates', () => {
	test('returns the next occurrence with the age reached', () => {
		const [next] = upcomingDates([source()], TODAY);
		expect(next.date).toBe('2026-09-20');
		expect(next.daysUntil).toBe(16);
		expect(next.turning).toBe(11);
	});

	test('includes a date falling today', () => {
		const [next] = upcomingDates([source({ date: '2015-09-04' })], TODAY);
		expect(next.daysUntil).toBe(0);
	});

	test('rolls a date already past this year into the next one, beyond the horizon', () => {
		expect(upcomingDates([source({ date: '2015-09-03' })], TODAY)).toEqual([]);
	});

	test('reports no age when the birth year is unknown', () => {
		const [next] = upcomingDates([source({ date: '--09-20' })], TODAY);
		expect(next.date).toBe('2026-09-20');
		expect(next.turning).toBeNull();
	});

	test('moves a 29 February anniversary to 1 March in a non-leap year', () => {
		const [next] = upcomingDates([source({ date: '2016-02-29' })], '2027-02-20');
		expect(next.date).toBe('2027-03-01');
		expect(next.daysUntil).toBe(9);
	});

	test('keeps 29 February in a leap year', () => {
		const [next] = upcomingDates([source({ date: '2016-02-29' })], '2028-02-20');
		expect(next.date).toBe('2028-02-29');
	});

	test('leaves out deceased people', () => {
		expect(upcomingDates([source({ isDeceased: true })], TODAY)).toEqual([]);
	});

	test('leaves out dates the household muted', () => {
		expect(upcomingDates([source({ remind: false })], TODAY)).toEqual([]);
	});

	test('an explicit birthday overrides the one derived from the birth date', () => {
		const derived = source({ date: '2015-09-20', derived: true });
		const explicit = source({ date: '2015-09-10', derived: false });
		const result = upcomingDates([derived, explicit], TODAY);
		expect(result).toHaveLength(1);
		expect(result[0].date).toBe('2026-09-10');
	});

	test('a muted explicit birthday silences the derived one too', () => {
		const derived = source({ derived: true });
		const muted = source({ derived: false, remind: false });
		expect(upcomingDates([derived, muted], TODAY)).toEqual([]);
	});

	test('sorts by how soon, then by name', () => {
		const rows = [
			source({ contactId: 'b', contactName: 'Bea', date: '--09-25' }),
			source({ contactId: 'a', contactName: 'Ada', date: '--09-10' }),
			source({ contactId: 'c', contactName: 'Cem', date: '--09-10' })
		];
		expect(upcomingDates(rows, TODAY).map((d) => d.contactName)).toEqual(['Ada', 'Cem', 'Bea']);
	});

	test('stops at the limit', () => {
		const rows = Array.from({ length: UPCOMING_LIMIT + 3 }, (_, i) =>
			source({ contactId: `c${i}`, contactName: `P${i}`, date: '--09-20' })
		);
		expect(upcomingDates(rows, TODAY)).toHaveLength(UPCOMING_LIMIT);
	});

	test('ignores anything beyond the horizon', () => {
		const beyond = new Date(Date.UTC(2026, 8, 4 + UPCOMING_HORIZON_DAYS + 1))
			.toISOString()
			.slice(0, 10);
		expect(upcomingDates([source({ date: beyond })], TODAY)).toEqual([]);
	});

	test('ignores a birth date with no month and day', () => {
		expect(upcomingDates([source({ date: '2015' })], TODAY)).toEqual([]);
	});
});

describe('one-off dates', () => {
	const once = (date: string) =>
		source({ kind: 'custom', label: 'Umzug', recursYearly: false, derived: false, date });

	test('appears while it is still ahead', () => {
		const [next] = upcomingDates([once('2026-09-12')], TODAY);
		expect(next.label).toBe('Umzug');
		expect(next.daysUntil).toBe(8);
		expect(next.turning).toBeNull();
	});

	test('disappears once it has passed', () => {
		expect(upcomingDates([once('2026-09-03')], TODAY)).toEqual([]);
	});
});
