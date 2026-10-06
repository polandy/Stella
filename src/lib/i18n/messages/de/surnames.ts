import type { SurnamesMessages } from '../en/surnames';

/** German for `messages/en/surnames.ts`. */
export const surnames: SurnamesMessages = {
	'surnames.reason.child': (p) => `Kind von ${p.parent}`,
	'surnames.reason.sibling': (p) => `Geschwister von ${p.sibling}`,
	'surnames.reason.partner': (p) => `Partner von ${p.partner}`,
	'surnames.reason.partnerBorn': (p) => `Partner von ${p.partner}, früher ${p.former}`,
	'surnames.reason.shownName': (p) => `Angezeigt als „${p.name}“`,
	'surnames.reason.parent': (p) => `Elternteil von ${p.child}`,
	'surnames.reason.circle': (p) => `Im Kreis ${p.circle}`,

	'surnames.toast.set': (p) =>
		p.count === 1
			? `Nachname ${p.name} gesetzt`
			: `Nachname ${p.name} für ${p.count} Personen gesetzt`,
	'surnames.toast.failed':
		'Die Nachnamen konnten nicht gespeichert werden. Die Personen sind wieder in der Liste.',
	'surnames.offline': 'Nachnamen setzen geht nur mit Verbindung zu Stella.',
	'surnames.namesake': (p) => `Es gibt schon eine Person namens ${p.name}`,
	'surnames.namesakeAsk': 'Dieselbe Person?',

	'surnames.page.pageTitle': 'Nachnamen · Stella',
	'surnames.page.title': 'Nachnamen',
	'surnames.page.intro':
		'Alle ohne Nachnamen. Wo eine Verbindung, ein Kreis oder ihr eigener Eintrag ihn verrät, schlägt Stella ihn vor — gespeichert wird erst, wenn du ihn übernimmst.',
	'surnames.page.empty.title': 'Alle haben einen Nachnamen',
	'surnames.page.empty.hint': 'Wer ohne Nachnamen hinzukommt, erscheint hier.',
	'surnames.blurb': 'Personen ohne Nachnamen, und welche Stella herausfinden kann',
	'surnames.applyTo': (p) => `Für ${p.count} übernehmen`,
	'surnames.chooseOne': 'Einen wählen',
	'surnames.noSuggestion': 'Kein Vorschlag',
	'surnames.select': 'Auswählen…',
	'surnames.choose': (p) => `${p.name} auswählen`,
	'surnames.deceased': 'verstorben',
	'surnames.rowMenu': (p) => `Mehr zu ${p.name}`,
	'surnames.instead': (p) => `oder: ${p.name}`,
	'surnames.notThisName': (p) => `Nicht ${p.name}`,
	'surnames.declined': (p) => `Abgelehnte Namen (${p.count})`,
	'surnames.declinedRow': (p) => `${p.person} — nicht ${p.name}`,
	'surnames.offerAgain': 'Wieder vorschlagen',
	'surnames.setLastName': 'Nachnamen setzen',
	'surnames.lastNamePlaceholder': 'Nachname…',
	'surnames.next': 'Weiter',
	'surnames.back': 'Zurück',
	'surnames.set': 'Setzen',
	'surnames.confirm': (p) =>
		p.count === 1 ? `${p.name} für 1 Person setzen.` : `${p.name} für ${p.count} Personen setzen.`,
	'surnames.replace': (p) => `${p.person} hat schon den Nachnamen ${p.name} — ersetzen`,
	'surnames.count': (p) =>
		`${p.missing === 1 ? '1 Person hat' : `${p.missing} Personen haben`} keinen Nachnamen · ${p.suggested} mit Vorschlag`,
	'surnames.toast.passOn': (p) =>
		`Nachname gespeichert. ${p.people} ${p.count === 1 ? 'hat' : 'haben'} noch keinen — auch ${p.name}?`,
	'surnames.toast.yes': 'Ja',
	'surnames.chip': (p) => `${p.name}?`,
	'surnames.chipHint': (p) => `Nachnamen ${p.name} geben`,
	'surnames.passOnPrompt': (p) =>
		`${p.people} ${p.count === 1 ? 'hat' : 'haben'} noch keinen Nachnamen — auch ${p.name}?`,
	'surnames.no': 'Nein'
};
