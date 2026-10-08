import type { GiftsMessages } from '../en/gifts';

/** German for `messages/en/gifts.ts`. */
export const gifts: GiftsMessages = {
	'gifts.title': 'Geschenke',
	'gifts.none': 'Noch keine Geschenkideen.',
	'gifts.addIdea': 'Idee',
	'gifts.addGiven': 'Geschenkt',
	'gifts.addReceived': 'Bekommen',
	'gifts.menu': 'Mehr zu Geschenken',
	'gifts.untitled': 'Geschenk',

	'gifts.tabs.label': 'Geschenke nach Art',
	'gifts.tab.ideas': 'Ideen',
	'gifts.tab.given': 'Geschenkt',
	'gifts.tab.received': 'Bekommen',
	'gifts.ideas.empty': (p) =>
		`Eine Idee für ${p.name}? Notier sie hier, dann ist sie da, wenn es so weit ist.`,
	'gifts.given.empty': 'Noch nichts verschenkt.',

	'gifts.form.ideaFor': (p) => `Idee für ${p.name}`,
	'gifts.form.givenTo': (p) => `An ${p.name} geschenkt`,
	'gifts.form.receivedFrom': (p) => `Von ${p.name} bekommen`,
	'gifts.form.what': 'Was?',
	'gifts.form.whatPlaceholder': 'z. B. Teekanne aus Gusseisen',
	'gifts.form.more': 'Notiz oder Link',
	'gifts.form.note': 'Notiz',
	'gifts.form.notePlaceholder': 'Größe, Farbe, wo es gesehen wurde',
	'gifts.form.link': 'Link',
	'gifts.form.on': 'Am',
	'gifts.form.occasion': 'Anlass',
	'gifts.form.otherOccasion': 'Welcher Anlass?',
	'gifts.form.alreadyGiven': (p) =>
		`Schon geschenkt: „${p.title}“ am ${p.day}${p.occasion ? ` (${p.occasion})` : ''}.`,

	'gifts.occasion.birthday': 'Geburtstag',
	'gifts.occasion.christmas': 'Weihnachten',
	'gifts.occasion.anniversary': 'Hochzeitstag',
	'gifts.occasion.other': 'Anderer …',

	'gifts.markGiven': 'Als verschenkt eintragen',
	'gifts.markGiven.open': 'Verschenkt …',
	'gifts.markGiven.title': (p) => `„${p.title}“ verschenkt`,
	// When an idea was noted, under its title.
	'gifts.addedOn': (p) => `Notiert am ${p.day}`,
	'gifts.notedBy': (p) => `notiert von ${p.name}`,
	'gifts.notedByYou': 'notiert von dir',
	'gifts.link': 'Link',
	'gifts.openLink': (p) => `Link zu „${p.title}“ öffnen`,
	'gifts.edit': (p) => `„${p.title}“ bearbeiten`,
	'gifts.remove': (p) => `„${p.title}“ entfernen`,
	'gifts.removed': 'Geschenk entfernt',

	'gifts.state.idea': 'Idee',
	'gifts.state.given': (p) => `Geschenkt am ${p.day}`,
	'gifts.state.received': (p) => `Bekommen am ${p.day}`,

	'gifts.story.given': 'Geschenkt',
	'gifts.story.received': 'Bekommen'
};
