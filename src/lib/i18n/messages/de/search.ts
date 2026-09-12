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
		'Die Karte zeichnet sich aus den Menschen und ihren Verbindungen. Lege jemanden an, um zu beginnen.',
	'graph.find': 'Person finden',
	'graph.findPlaceholder': 'Person finden…',
	'graph.filter.circles': 'Kreise',
	'graph.filter.kinship': 'Verwandtschaft',
	'graph.connectionPath': 'Verbindungsweg',
	'graph.labels': 'Bezeichnungen',
	'graph.labels.hint': 'Jede Linie mit ihrer Beziehung benennen',
	'graph.path.none': 'Zwischen diesen beiden ist keine Verbindung zu finden.',
	'graph.path.pickSecond': 'Wähle jetzt die zweite Person…',
	'graph.path.pickTwo': 'Wähle zwei Menschen, um ihre Verbindung zu verfolgen.',
	'graph.peek.sharedContext': 'Gemeinsamer Zusammenhang',
	'graph.peek.person': 'Person',
	'graph.peek.deceased': 'verstorben',
	'graph.peek.expand': 'Verbindungen aufklappen',
	'graph.peek.openProfile': 'Profil öffnen',
	'graph.peek.tip':
		'Tipp: Klicke einen ausgewählten Knoten an, um ihn aufzuklappen — oder nutze den Verbindungsweg, um zu sehen, wie zwei Menschen verbunden sind.'
};
