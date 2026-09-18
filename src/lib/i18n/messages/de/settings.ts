import type { SettingsMessages } from '../en/settings';

/** German for `messages/en/settings.ts`. */
export const settings: SettingsMessages = {
	'settings.title': 'Einstellungen',
	'settings.intro':
		'Darstellungseinstellungen kommen noch; Sprache, Datenwerkzeuge, das Beziehungs-Vokabular und dein Konto findest du schon hier.',
	'settings.language.heading': 'Sprache',
	'settings.language.label': 'Sprache der Oberfläche',
	'settings.language.hint':
		'Stella spricht Deutsch und Englisch. Deine Wahl wird in deinem Profil gespeichert und gilt damit auf jedem Gerät, auf dem du dich anmeldest.',
	'settings.language.saved': 'Sprache geändert.',
	'settings.language.unsupported': 'Diese Sprache spricht Stella nicht.',
	'settings.self.heading': 'Du',
	'settings.self.label': 'Welche dieser Personen bist du',
	'settings.self.hint':
		'Sag Stella, welcher Eintrag du bist — dann weiss Stella, auf wessen Geschichte die Karte öffnet und welche Zeile du bist.',
	'settings.self.placeholder': 'Dich selbst über den Namen suchen',
	'settings.self.clear': 'Keine davon bin ich',
	'settings.self.saved': 'Gespeichert.',
	'settings.data.heading': 'Daten',
	'settings.data.importPeople': 'Menschen importieren',
	'settings.data.importPeopleBlurb':
		'Hol deine Menschen, Beziehungen, Notizen und Fotos aus einem Monica-Export herüber — oder Kontakte aus einer vCard.',
	'settings.data.download': 'Archiv herunterladen',
	'settings.data.downloadBlurb':
		'Alles, was der Haushalt hat, als eine lesbare Textdatei mit den Fotos daneben — dir gehörend und mit allem lesbar.',
	'settings.data.restore': 'Aus einem Archiv wiederherstellen',
	'settings.data.restoreBlurb':
		'Ein Stella-Archiv wieder einlesen. Was dieser Haushalt schon hat, bleibt unangetastet.',
	'settings.data.relationshipTypes': 'Beziehungsarten',
	'settings.data.relationshipTypesBlurb':
		'Benenne die Arten von Verbindungen, die dein Haushalt festhält — über die hinaus, die Stella mitbringt.',
	'settings.data.adminOnly':
		'Import, Sicherungen und die Beziehungsarten sind der Haushalts-Administration vorbehalten.',
	'settings.relationships.heading': 'Beziehungen',
	'settings.relationships.title': 'Beziehungen prüfen',
	'settings.relationships.intro':
		'Stella geht alle Personen durch, die du sehen kannst, und zeigt die Familienverbindungen, die sich aus dem Eingetragenen ergeben. Gespeichert wird erst, was du übernimmst.',
	'settings.relationships.blurb':
		'Den ganzen Haushalt auf einmal durchgehen, statt Profil für Profil.',
	'settings.relationships.idle': 'Noch nichts geprüft',
	'settings.relationships.idleHint':
		'Es läuft keine Regel, bevor du fragst. Bei einem grossen Haushalt dauert das einen Moment.',
	'settings.relationships.check': 'Alle Beziehungen prüfen',
	'settings.relationships.checkAgain': 'Erneut prüfen',
	'settings.relationships.openCount': (p) =>
		p.count === 1 ? '1 offener Vorschlag' : `${p.count} offene Vorschläge`,
	'settings.relationships.nothing':
		'Nichts Offenes. Stella findet in deinem Haushalt nichts, was nicht schon eingetragen ist.',
	'settings.relationships.openAcross': (p) =>
		`${p.claims} offen bei ${p.people === 1 ? '1 Person' : `${p.people} Personen`}`,
	'settings.relationships.peopleRange': (p) => `Personen ${p.from}–${p.to} von ${p.total}`,
	'settings.relationships.answerRange': (p) => `Antworten ${p.from}–${p.to} von ${p.total}`,
	'settings.relationships.nextPeople': (p) => `Nächste ${p.count} Personen`,
	'settings.relationships.previousPeople': (p) => `Vorherige ${p.count} Personen`,
	'settings.relationships.nextPage': 'Weiter',
	'settings.relationships.previousPage': 'Zurück',
	'settings.relationships.moreForPerson': (p) => `${p.count} weitere für ${p.name}`,
	'settings.relationships.openAll': (p) => `Alle ${p.count} öffnen`,
	'settings.relationships.findPerson': 'Person suchen',
	'settings.relationships.searchSubmit': 'Suchen',
	'settings.relationships.clearSearch': 'Zurücksetzen',
	'settings.relationships.noMatch': (p) => `Zu „${p.query}“ ist nichts offen.`,
	'settings.relationships.declinedLog': (p) =>
		p.count === 1 ? '1 abgelehnter Vorschlag' : `${p.count} abgelehnte Vorschläge`,
	'settings.relationships.declinedHeading': 'Abgelehnte Vorschläge',
	'settings.relationships.declinedBlurb':
		'Wozu jemand in diesem Haushalt Nein gesagt hat. Wieder anbieten stellt den Vorschlag zurück in die Liste.',
	'settings.relationships.backToList': 'Zurück zur Liste',
	'settings.account.heading': 'Konto',
	'settings.about.heading': 'Über Stella',
	'settings.about.version': (p: { version: string }) => `Stella ${p.version}`,
	'settings.about.checking': 'Suche nach einer neueren Version …',
	'settings.about.badge': 'Neu',
	'settings.about.available': (p: { version: string }) => `${p.version} ist verfügbar`,
	'settings.about.releaseNotes': 'Release Notes',
	'settings.about.current': 'Das ist die neueste Version.',
	'settings.about.unreachable':
		'GitHub war nicht erreichbar, es kann also eine neuere Version geben.',
	'settings.about.unreachableSince': (p: { when: string }) => `Zuletzt geprüft: ${p.when}.`,
	'settings.api.heading': 'API',
	'settings.api.title': 'API-Tokens',
	'settings.api.blurb': 'Lass ein Skript oder einen Assistenten Menschen für dich erfassen — etwa aus einer Klassenliste.',
	'settings.apiTokens.intro':
		'Mit einem Token handelt ein Skript über Stellas API in deinem Namen: Es findet und erfasst genau das, was du könntest, und nicht mehr. Behandle es wie ein Passwort.',
	'settings.apiTokens.create': 'Neues Token',
	'settings.apiTokens.name': 'Wofür ist es?',
	'settings.apiTokens.namePlaceholder': 'Import Klassenliste',
	'settings.apiTokens.lifetime': 'Gültig für',
	'settings.apiTokens.days': (p) => `${p.count} Tage`,
	'settings.apiTokens.submit': 'Token erstellen',
	'settings.apiTokens.createdHeading': 'Kopiere dein Token jetzt',
	'settings.apiTokens.createdHint':
		'Stella speichert nur einen Fingerabdruck davon und kann es nicht noch einmal zeigen. Geht es verloren, widerrufe es und erstelle ein neues.',
	'settings.apiTokens.usage': 'Schicke es bei jeder Anfrage mit:',
	'settings.apiTokens.copy': 'Kopieren',
	'settings.apiTokens.copied': 'Kopiert',
	'settings.apiTokens.yours': 'Deine Tokens',
	'settings.apiTokens.none': 'Du hast keine Tokens.',
	'settings.apiTokens.validUntil': (p) => `Gültig bis ${p.date}`,
	'settings.apiTokens.expired': (p) => `Abgelaufen am ${p.date}`,
	'settings.apiTokens.lastUsed': (p) => `zuletzt benutzt ${p.date}`,
	'settings.apiTokens.neverUsed': 'nie benutzt',
	'settings.apiTokens.revoke': 'Widerrufen',
	'settings.apiTokens.revokeLabel': (p) => `„${p.name}“ widerrufen`,
	'settings.apiTokens.revoked': 'Token widerrufen. Skripte damit können sich nicht mehr anmelden.',
	'settings.apiTokens.notFound': 'Dieses Token gibt es schon nicht mehr.',
	'settings.about.off':
		'Stella sucht nicht nach neuen Versionen. Mit UPDATE_CHECK=true schaltest du die Suche ein.'
};
