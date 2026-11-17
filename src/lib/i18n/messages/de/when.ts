import type { WhenMessages } from '../en/when';

/** German for `messages/en/when.ts`. */
export const when: WhenMessages = {
	'when.label': 'Wann?',
	'when.kind.now': 'Sofort',
	'when.kind.from_age': 'Ab Alter',
	'when.kind.at_age': 'Zum Geburtstag',
	'when.kind.on_date': 'Zu einem Datum',
	'when.kind.later': 'Später',
	'when.age': 'Alter',
	'when.older': 'Ein Jahr älter',
	'when.younger': 'Ein Jahr jünger',
	'when.day': 'Tag',
	'when.christmas': (p) => `Weihnachten ${p.year}`,
	'when.needsYear': 'Für ein Alter braucht es das Geburtsjahr.',
	'when.estimate': 'Alter schätzen',

	'when.chip.fromAge': (p) => `Ab ${p.age} Jahren`,
	'when.chip.atAge': (p) => `Zum ${p.age}. Geburtstag`,
	'when.chip.onDay': (p) => `Zum ${p.day}`,
	'when.chip.about': (p) => `etwa ${p.year}`,
	'when.chip.tomorrow': 'morgen',
	'when.chip.today': 'heute',
	'when.chip.passed': 'vorbei',

	'when.preview.now': 'Steht gleich bei den Ideen.',
	'when.preview.later':
		'Wartet unter „Später“. Einmal im Jahr kommt die Frage, ob sie noch aktuell ist.',
	'when.preview.ageReached': (p) => `Schon ${p.age}, also steht sie gleich bei den Ideen.`,
	'when.preview.turns': (p) => `Wird am ${p.day} ${p.age}.`,
	'when.preview.turnsAbout': (p) => `Wird ungefähr ${p.year} ${p.age}.`,
	'when.preview.onDay': (p) => `Fällig am ${p.day}.`,
	'when.preview.waits': (p) => `Sie wartet bis zum ${p.day}, dann steht sie bei den Ideen.`,
	'when.preview.open': 'Sie steht gleich bei den Ideen.',

	'when.ask.passed': 'Der Anlass ist vorbei. Noch aktuell?',
	'when.ask.review': 'Für später notiert. Noch aktuell?',
	'when.ask.group': (p) => `Ist „${p.title}“ noch aktuell?`,
	'when.ask.keep': 'Als Idee behalten',
	'when.ask.move': 'Neuer Zeitpunkt',

	'when.fold': (p) => `Später · ${p.count}`,
	'when.allWaiting': 'Noch nichts fällig. Die Ideen für später warten unten.'
};
