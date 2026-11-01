import { describe, expect, test } from 'bun:test';
import { createTranslator } from '../../../i18n/translate';
import { calendarEvents, calendarFeed } from './calendar-feed';
import type { UpcomingSource } from './upcoming';

const en = createTranslator('en');
const de = createTranslator('de');
const ORIGIN = 'https://stella.example';

function source(over: Partial<UpcomingSource> = {}): UpcomingSource {
	return {
		dateId: null,
		contactId: 'c1',
		contactName: 'Anna Example',
		avatarPhotoId: null,
		isDeceased: false,
		kind: 'birthday',
		label: null,
		date: '2015-11-12',
		recursYearly: true,
		remind: true,
		derived: true,
		...over
	};
}

describe('calendarEvents', () => {
	test('a derived birthday repeats yearly from the birth day, with the year and a link', () => {
		expect(calendarEvents([source()], en, ORIGIN)).toEqual([
			{
				uid: 'c1-birthday@stella',
				start: '2015-11-12',
				yearly: true,
				summary: "Anna Example's birthday",
				description: 'Born 2015',
				url: 'https://stella.example/contacts/c1'
			}
		]);
	});

	test('an explicit date is named by its row, so editing it replaces its event', () => {
		const [event] = calendarEvents(
			[source({ dateId: 'd9', kind: 'anniversary', date: '2010-06-05', derived: false })],
			en,
			ORIGIN
		);
		expect(event.uid).toBe('d9@stella');
		expect(event.summary).toBe("Anna Example's anniversary");
		expect(event.description).toBe('Since 2010');
	});

	test('a custom date carries its name', () => {
		const [event] = calendarEvents(
			[
				source({ dateId: 'd2', kind: 'custom', label: 'Name day', date: '--07-26', derived: false })
			],
			en,
			ORIGIN
		);
		expect(event.summary).toBe('Anna Example: Name day');
	});

	test('a date without a year still repeats, and says no year', () => {
		const [event] = calendarEvents([source({ date: '--11-12' })], en, ORIGIN);
		expect(event.start).toBe('2000-11-12');
		expect(event.yearly).toBe(true);
		expect(event.description).toBeNull();
	});

	test('a year-less 29 February starts on a leap day', () => {
		const [event] = calendarEvents([source({ date: '--02-29' })], en, ORIGIN);
		expect(event.start).toBe('2000-02-29');
	});

	test('a one-off date is a single event, past ones included, a year-less one dropped', () => {
		const events = calendarEvents(
			[
				source({
					dateId: 'd3',
					kind: 'custom',
					label: 'Graduation',
					date: '2020-06-30',
					recursYearly: false,
					derived: false
				}),
				source({
					dateId: 'd4',
					kind: 'custom',
					label: 'Move',
					date: '--03-01',
					recursYearly: false,
					derived: false
				})
			],
			en,
			ORIGIN
		);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			uid: 'd3@stella',
			start: '2020-06-30',
			yearly: false,
			description: null
		});
	});

	test('follows the radar: muted, deceased and overridden birthdays stay out', () => {
		const events = calendarEvents(
			[
				source({ contactId: 'muted', dateId: 'm', derived: false, remind: false }),
				source({ contactId: 'gone', isDeceased: true }),
				source({ contactId: 'c2' }),
				source({ contactId: 'c2', dateId: 'fix', date: '2015-11-13', derived: false })
			],
			en,
			ORIGIN
		);
		expect(events.map((e) => e.uid)).toEqual(['fix@stella']);
	});

	test('speaks the member’s language', () => {
		const [birthday, anniversary] = calendarEvents(
			[source(), source({ dateId: 'd9', kind: 'anniversary', date: '2010-06-05', derived: false })],
			de,
			ORIGIN
		);
		expect(birthday.summary).toBe('Geburtstag von Anna Example');
		expect(birthday.description).toBe('Geboren 2015');
		expect(anniversary.summary).toBe('Jahrestag von Anna Example');
		expect(anniversary.description).toBe('Seit 2010');
	});

	test('comes out in the same order whatever order the sources came in', () => {
		const a = source({ contactId: 'a', contactName: 'Ben' });
		const b = source({ contactId: 'b', contactName: 'Cleo', date: '2001-01-02' });
		expect(calendarEvents([a, b], en, ORIGIN)).toEqual(calendarEvents([b, a], en, ORIGIN));
	});
});

describe('calendarFeed', () => {
	const viewer = { id: 'u1', householdId: 'h1' };

	test('reads the viewer’s dates and stamps them with today, so a day’s fetches match', async () => {
		const asked: unknown[] = [];
		const deps = {
			dates: {
				listSourcesVisibleTo: async (v: typeof viewer) => {
					asked.push(v);
					return [source()];
				}
			},
			clock: { now: () => Date.UTC(2026, 10, 1, 9, 30) }
		};
		const morning = await calendarFeed(deps, { viewer, translate: en, origin: ORIGIN });
		const evening = await calendarFeed(
			{ ...deps, clock: { now: () => Date.UTC(2026, 10, 1, 21, 0) } },
			{ viewer, translate: en, origin: ORIGIN }
		);
		expect(asked).toEqual([viewer, viewer]);
		expect(morning).toContain('DTSTAMP:20261101T000000Z');
		expect(morning).toContain("SUMMARY:Anna Example's birthday");
		expect(evening).toBe(morning);
	});
});
