/*
 * How a date reads on screen (docs/02 §2.13.3): countdowns, occasions and the length of a
 * silence. The shapes are computed in `$lib/dates/labels`; only the wording lives here.
 */

export const dates = {
	'dates.inDays': (p: { days: number }) => `in ${p.days} days`,
	'dates.hasBirthday': 'has a birthday',
	'dates.turns': (p: { age: number }) => `turns ${p.age}`,
	'dates.namedAnniversary': (p: { label: string; years: number }) => `${p.label} · ${p.years} years`,
	'dates.hasAnniversary': 'has an anniversary',
	'dates.yearsTogether': (p: { years: number }) => `${p.years} years together`,
	'dates.somethingComingUp': 'has something coming up',
	'dates.aYear': 'a year',
	'dates.years': (p: { years: number }) => `${p.years} years`,
	'dates.months': (p: { months: number }) => `${p.months} months`,
	'dates.weeks': (p: { weeks: number }) => `${p.weeks} weeks`,
	'dates.days': (p: { days: number }) => `${p.days} days`,
	'dates.ago.aYear': 'a year ago',
	'dates.ago.years': (p: { years: number }) => `${p.years} years ago`,
	'dates.ago.months': (p: { months: number }) => `${p.months} months ago`,
	'dates.ago.weeks': (p: { weeks: number }) => `${p.weeks} weeks ago`,
	'dates.ago.days': (p: { days: number }) => `${p.days} days ago`
};

/** The key set every translation of this area has to provide. */
export type DatesMessages = typeof dates;
