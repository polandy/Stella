import type { MemoriesMessages } from '../en/memories';

/** German for `messages/en/memories.ts`. */
export const memories: MemoriesMessages = {
	'memories.title': 'An diesem Tag',
	'memories.yearsAgo': (p) => (p.count === 1 ? 'Vor einem Jahr' : `Vor ${p.count} Jahren`),
	'memories.moreFrom': (p) => `Mehr vom ${p.day}`,
	'memories.photoOf': (p) => `Foto von ${p.name}, ${p.year}`,
	'memories.page.intro': (p) => `Was der Haushalt am ${p.day} in früheren Jahren festgehalten hat.`,
	'memories.page.empty': (p) => `Am ${p.day} wurde in früheren Jahren nichts festgehalten.`,
	'memories.page.day': 'Tag',
	'memories.page.earlier': 'Tag davor',
	'memories.page.later': 'Tag danach',
	'memories.page.today': 'Heute'
};
