/*
 * *On this day* (docs/02 §2.12.1): Home's band and `/on-this-day`, what the household wrote on
 * a day's date in earlier years.
 */

export const memories = {
	'memories.title': 'On this day',
	'memories.yearsAgo': (p: { count: number }) =>
		p.count === 1 ? '1 year ago' : `${p.count} years ago`,
	'memories.moreFrom': (p: { day: string }) => `More from ${p.day}`,
	'memories.photoOf': (p: { name: string; year: number }) => `Photo of ${p.name}, ${p.year}`,
	'memories.page.intro': (p: { day: string }) =>
		`What the household wrote on ${p.day} in earlier years.`,
	'memories.page.empty': (p: { day: string }) => `Nothing written on ${p.day} in earlier years.`,
	'memories.page.day': 'Day',
	'memories.page.earlier': 'Day before',
	'memories.page.later': 'Day after',
	'memories.page.today': 'Today'
};

export type MemoriesMessages = typeof memories;
