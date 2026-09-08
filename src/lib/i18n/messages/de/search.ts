import type { SearchMessages } from '../en/search';

/** German for `messages/en/search.ts`. */
export const search: SearchMessages = {
	'search.title': 'Suche',
	'search.placeholder': 'Menschen und Notizen durchsuchen…',
	'search.noResults': (p) => `Keine Treffer für „${p.query}“.`,
	'search.prompt': 'Tippe, um Menschen und Notizen zu durchsuchen.',
	'search.people': 'Menschen',
	'search.notes': 'Notizen',
	'search.noteOn': (p) => `zu ${p.name}`,
	'graph.title': 'Netz · Stella',
	'graph.hint': 'Klicken zum Fokussieren · noch einmal klicken zum Aufklappen · einen Verbindungsweg verfolgen',
	'graph.empty.title': 'Noch nichts zu erkunden',
	'graph.empty.hint':
		'Die Karte zeichnet sich aus den Menschen und ihren Verbindungen. Lege jemanden an, um zu beginnen.'
};
