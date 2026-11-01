import type { DatesMessages } from '../en/dates';

/** German for `messages/en/dates.ts`. */
export const dates: DatesMessages = {
	'dates.inDays': (p) => `in ${p.days} Tagen`,
	'dates.hasBirthday': 'hat Geburtstag',
	'dates.turns': (p) => `wird ${p.age}`,
	'dates.namedAnniversary': (p) => `${p.label} · ${p.years} Jahre`,
	'dates.hasAnniversary': 'hat einen Jahrestag',
	'dates.yearsTogether': (p) => `${p.years} Jahre zusammen`,
	'dates.somethingComingUp': 'hat etwas vor sich',
	'dates.ago.aYear': 'vor einem Jahr',
	'dates.ago.years': (p) => `vor ${p.years} Jahren`,
	'dates.ago.months': (p) => `vor ${p.months} Monaten`,
	'dates.ago.weeks': (p) => `vor ${p.weeks} Wochen`,
	'dates.ago.days': (p) => `vor ${p.days} Tagen`,
	'dates.feed.birthday': (p) => `Geburtstag von ${p.name}`,
	'dates.feed.anniversary': (p) => `Jahrestag von ${p.name}`,
	'dates.feed.custom': (p) => `${p.name}: ${p.label}`,
	'dates.feed.born': (p) => `Geboren ${p.year}`,
	'dates.feed.since': (p) => `Seit ${p.year}`
};
