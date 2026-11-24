import { describe, expect, test } from 'bun:test';
import { createTranslator } from '../../../i18n/translate';
import { NO_GIVER, type IdeaWithBirth, type OpenIdea } from '../gifts/gifts';
import type { OpenPlan } from '../plans/plans';
import type { HouseholdTodo } from '../todos/todos';
import {
	calendarEvents,
	calendarFeed,
	giftIdeaEvents,
	planEvents,
	todoEvents
} from './calendar-feed';
import type { UpcomingSource } from './upcoming';

const en = createTranslator('en');
const de = createTranslator('de');
const ORIGIN = 'https://stella.example';
const enLang = { t: en, intlLocale: 'en-GB' };
const deLang = { t: de, intlLocale: 'de-DE' };

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

function todo(over: Partial<HouseholdTodo> = {}): HouseholdTodo {
	return {
		id: 't1',
		contactId: 'c1',
		contactName: 'Anna Example',
		avatarPhotoId: null,
		createdBy: 'u1',
		visibility: 'shared',
		title: 'Give back the book',
		dueOn: '2026-11-06',
		doneAt: null,
		doneOn: null,
		doneBy: null,
		createdAt: 0,
		updatedAt: 0,
		...over
	};
}

describe('todoEvents', () => {
	test('a to-do with a day is a one-off event on that day, linked to the person', () => {
		expect(todoEvents([todo()], en, ORIGIN)).toEqual([
			{
				uid: 'todo-t1@stella',
				start: '2026-11-06',
				yearly: false,
				summary: 'To-do: Give back the book (Anna Example)',
				description: null,
				url: 'https://stella.example/contacts/c1'
			}
		]);
	});

	test('a to-do without a day has no day to stand on', () => {
		expect(todoEvents([todo({ dueOn: null })], en, ORIGIN)).toEqual([]);
	});

	test('an overdue one stays on the day it was given — no nudge', () => {
		const [event] = todoEvents([todo({ dueOn: '2025-03-01' })], en, ORIGIN);
		expect(event.start).toBe('2025-03-01');
	});

	test('speaks the member’s language', () => {
		const [event] = todoEvents([todo({ title: 'Buch zurückgeben' })], de, ORIGIN);
		expect(event.summary).toBe('Zu tun: Buch zurückgeben (Anna Example)');
	});
});

function idea(over: Partial<IdeaWithBirth<OpenIdea>> = {}): IdeaWithBirth<OpenIdea> {
	return {
		id: 'g1',
		...NO_GIVER,
		storedAt: null,
		value: null,
		contactId: 'c1',
		contactName: 'Mia Example',
		avatarPhotoId: null,
		createdBy: 'u1',
		visibility: 'shared',
		state: 'idea',
		title: 'First bike',
		note: null,
		url: null,
		givenOn: null,
		occasion: null,
		when: { kind: 'from_age', age: 6 },
		whenCheckedOn: null,
		groupId: null,
		hiddenFromRecipient: false,
		createdAt: Date.UTC(2026, 0, 10),
		updatedAt: 0,
		birth: { value: '2021-03-14', precision: 'full' },
		...over
	};
}

describe('giftIdeaEvents', () => {
	// Mia turns 6 on 14 March 2027: 90 days before is 14 December 2026.
	const giftsOn = (ideas: IdeaWithBirth<OpenIdea>[], today: string, self: string | null = null) =>
		giftIdeaEvents(ideas, today, enLang, ORIGIN, self);

	test('an idea whose time draws near stands on its day, saying what it is for', () => {
		expect(giftsOn([idea()], '2026-12-20')).toEqual([
			{
				uid: 'gift-g1@stella',
				start: '2027-03-14',
				yearly: false,
				summary: 'Gift idea: First bike (Mia Example)',
				description: 'From age 6',
				url: 'https://stella.example/contacts/c1'
			}
		]);
	});

	test('a due idea stays on its day, a day the same', () => {
		const onDay = idea({ id: 'g2', when: { kind: 'on_date', on: '2026-12-24' } });
		expect(giftsOn([idea(), onDay], '2027-04-01').map((e) => [e.uid, e.start])).toEqual([
			['gift-g1@stella', '2027-03-14']
		]);
		expect(giftsOn([onDay], '2026-12-24')[0]).toMatchObject({
			start: '2026-12-24',
			description: 'Christmas 2026'
		});
	});

	test('an idea for Christmas at an age stands on that Christmas Eve', () => {
		const atSix = idea({ when: { kind: 'christmas_at_age', age: 6 } });
		expect(giftsOn([atSix], '2027-09-24')).toEqual([]);
		expect(giftsOn([atSix], '2027-09-25')[0]).toMatchObject({
			start: '2027-12-24',
			description: 'Christmas at 6'
		});
	});

	test('a waiting idea is not in the calendar until its lead time begins', () => {
		expect(giftsOn([idea()], '2026-12-13')).toEqual([]);
		expect(giftsOn([idea()], '2026-12-14')).toHaveLength(1);
	});

	test('an idea for now, for later, an estimated year or a passed day stays out', () => {
		const ideas = [
			idea({ id: 'now', when: null }),
			idea({ id: 'later', when: { kind: 'later' } }),
			idea({ id: 'about', birth: { value: '2021', precision: 'year' } }),
			idea({ id: 'passed', when: { kind: 'at_age', age: 6 } }),
			idea({ id: 'no-year', birth: null })
		];
		expect(giftsOn(ideas, '2027-04-01')).toEqual([]);
	});

	test('an idea for the member themselves never reaches their calendar', () => {
		expect(giftsOn([idea()], '2026-12-20', 'c1')).toEqual([]);
		expect(giftsOn([idea({ contactId: 'c2' })], '2026-12-20', 'c1')).toHaveLength(1);
	});

	describe('one idea for several people', () => {
		// Lego train for Christmas at 6: Mia and Ben are 6 on 24 December 2027, Lea a year later.
		const train = (id: string, contactId: string, contactName: string, born: string) =>
			idea({
				id,
				contactId,
				contactName,
				title: 'Lego train',
				groupId: 'gg1',
				when: { kind: 'christmas_at_age', age: 6 },
				birth: { value: born, precision: 'full' }
			});
		const mia = train('g-mia', 'c-mia', 'Mia', '2021-01-20');
		const ben = train('g-ben', 'c-ben', 'Ben', '2021-05-04');
		const lea = train('g-lea', 'c-lea', 'Lea', '2021-12-28');

		test('the group’s gifts on one day are one event naming everyone', () => {
			expect(giftsOn([mia, lea, ben], '2027-12-01')).toEqual([
				{
					uid: 'gift-group-gg1-2027-12-24@stella',
					start: '2027-12-24',
					yearly: false,
					summary: 'Gift idea: Lego train (Ben, Mia)',
					description: 'Christmas at 6',
					url: 'https://stella.example/contacts/c-ben?group=gg1#section-gifts'
				}
			]);
		});

		test('one left alone on its day keeps the group’s event, named for them', () => {
			const [event] = giftsOn([mia, train('g-x', 'c-x', 'Xaver', '2016-01-01')], '2027-12-01');
			expect(event).toMatchObject({
				uid: 'gift-group-gg1-2027-12-24@stella',
				summary: 'Gift idea: Lego train (Mia)'
			});
		});

		test('each day of the group is its own event', () => {
			const lea6 = '2028-12-01';
			expect(giftsOn([mia, ben, lea], lea6).map((e) => [e.uid, e.summary])).toEqual([
				['gift-group-gg1-2028-12-24@stella', 'Gift idea: Lego train (Lea)']
			]);
		});

		test('a title changed for one alone stands apart, as an idea of its own', () => {
			const own = { ...ben, title: 'Lego crane' };
			expect(giftsOn([mia, own], '2027-12-01').map((e) => [e.uid, e.summary])).toEqual([
				['gift-g-ben@stella', 'Gift idea: Lego crane (Ben)'],
				['gift-g-mia@stella', 'Gift idea: Lego train (Mia)']
			]);
		});

		test('the member’s own gift of the group stays out, the others still meet', () => {
			expect(giftsOn([mia, ben], '2027-12-01', 'c-mia')[0].summary).toBe(
				'Gift idea: Lego train (Ben)'
			);
		});
	});

	test('speaks the member’s language', () => {
		const [event] = giftIdeaEvents([idea()], '2026-12-20', deLang, ORIGIN, null);
		expect(event.summary).toBe('Geschenkidee: First bike (Mia Example)');
		expect(event.description).toBe('Ab 6 Jahren');
	});
});

function plan(over: Partial<OpenPlan> = {}): OpenPlan {
	return {
		id: 'p1',
		contactId: 'c1',
		contactName: 'Heinz Example',
		avatarPhotoId: null,
		birth: null,
		createdBy: 'u1',
		visibility: 'shared',
		hiddenFromPerson: false,
		title: 'Zoo',
		note: null,
		url: null,
		when: { kind: 'on_date', on: '2026-12-06' },
		bookedAt: null,
		bookedBy: null,
		doneAt: null,
		doneOn: null,
		doneBy: null,
		momentId: null,
		createdAt: Date.UTC(2026, 0, 10, 12),
		updatedAt: 0,
		...over
	};
}

describe('planEvents', () => {
	test('one entry ninety days ahead of a dated idea, never one on its day (E15)', () => {
		expect(planEvents([plan()], '2026-11-17', enLang, ORIGIN)).toEqual([
			{
				uid: 'plan-p1@stella',
				start: '2026-09-07',
				yearly: false,
				summary: 'Outing ahead: Zoo (Heinz Example)',
				description: 'For 6 December 2026',
				url: `${ORIGIN}/contacts/c1`
			}
		]);
	});

	test('leaves out an undated idea and one whose day has gone by', () => {
		expect(
			planEvents(
				[
					plan({ id: 'p2', when: null }),
					plan({ id: 'p3', when: { kind: 'on_date', on: '2026-11-01' } })
				],
				'2026-11-17',
				enLang,
				ORIGIN
			)
		).toEqual([]);
	});

	test('speaks the member’s language', () => {
		const [event] = planEvents([plan()], '2026-11-17', deLang, ORIGIN);
		expect(event.summary).toBe('Unternehmung steht an: Zoo (Heinz Example)');
	});
});

describe('calendarFeed', () => {
	const viewer = { id: 'u1', householdId: 'h1' };
	const reader = {
		viewer,
		translate: en,
		intlLocale: 'en-GB',
		selfContactId: null,
		origin: ORIGIN
	};
	const noGifts = { listOpenIdeasVisibleTo: async () => [] };
	const noPlans = { listOpenVisibleTo: async () => [] };

	test('reads the viewer’s dates and stamps them with today, so a day’s fetches match', async () => {
		const asked: unknown[] = [];
		const deps = {
			dates: {
				listSourcesVisibleTo: async (v: typeof viewer) => {
					asked.push(v);
					return [source()];
				}
			},
			todos: { listOpenVisibleTo: async () => [] },
			gifts: noGifts,
			plans: noPlans,
			clock: { now: () => Date.UTC(2026, 10, 1, 9, 30) }
		};
		const morning = await calendarFeed(deps, reader);
		const evening = await calendarFeed(
			{ ...deps, clock: { now: () => Date.UTC(2026, 10, 1, 21, 0) } },
			reader
		);
		expect(asked).toEqual([viewer, viewer]);
		expect(morning).toContain('DTSTAMP:20261101T000000Z');
		expect(morning).toContain("SUMMARY:Anna Example's birthday");
		expect(evening).toBe(morning);
	});

	test('holds the viewer’s open to-dos with a day beside their dates', async () => {
		const asked: unknown[] = [];
		const ics = await calendarFeed(
			{
				dates: { listSourcesVisibleTo: async () => [source()] },
				todos: {
					listOpenVisibleTo: async (v: typeof viewer) => {
						asked.push(v);
						return [todo(), todo({ id: 't2', title: 'Call back', dueOn: null })];
					}
				},
				gifts: noGifts,
				plans: noPlans,
				clock: { now: () => Date.UTC(2026, 10, 1, 9, 30) }
			},
			reader
		);
		expect(asked).toEqual([viewer]);
		expect(ics).toContain('UID:todo-t1@stella');
		expect(ics).toContain('SUMMARY:To-do: Give back the book (Anna Example)');
		expect(ics).not.toContain('Call back');
		expect(ics).toContain("SUMMARY:Anna Example's birthday");
	});

	test('asks for the viewer’s own ideas and holds those whose time is near, on the household’s day', async () => {
		const asked: unknown[] = [];
		const ics = await calendarFeed(
			{
				dates: { listSourcesVisibleTo: async () => [] },
				todos: { listOpenVisibleTo: async () => [] },
				gifts: {
					listOpenIdeasVisibleTo: async (v: typeof viewer) => {
						asked.push(v);
						return [idea(), idea({ id: 'g2', contactId: 'me', title: 'Watch' })];
					}
				},
				plans: noPlans,
				clock: { now: () => Date.UTC(2026, 11, 20, 9, 30) }
			},
			{ ...reader, selfContactId: 'me' }
		);
		expect(asked).toEqual([viewer]);
		expect(ics).toContain('UID:gift-g1@stella');
		expect(ics).toContain('DTSTART;VALUE=DATE:20270314');
		expect(ics).not.toContain('Watch');
	});

	test('asks for the outing ideas the viewer may see and holds their entry ahead', async () => {
		const asked: unknown[] = [];
		const ics = await calendarFeed(
			{
				dates: { listSourcesVisibleTo: async () => [] },
				todos: { listOpenVisibleTo: async () => [] },
				gifts: noGifts,
				plans: {
					listOpenVisibleTo: async (v: typeof viewer) => {
						asked.push(v);
						return [plan()];
					}
				},
				clock: { now: () => Date.UTC(2026, 10, 17, 9, 30) }
			},
			reader
		);
		expect(asked).toEqual([viewer]);
		expect(ics).toContain('UID:plan-p1@stella');
		expect(ics).toContain('DTSTART;VALUE=DATE:20260907');
		expect(ics).not.toContain('DTSTART;VALUE=DATE:20261206');
	});
});
