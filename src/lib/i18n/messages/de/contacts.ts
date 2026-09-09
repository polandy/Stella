import type { ContactsMessages } from '../en/contacts';

/** German for `messages/en/contacts.ts`. */
export const contacts: ContactsMessages = {
	'contacts.title': 'Menschen · Stella',
	'contacts.heading': 'Menschen',
	'contacts.headingArchived': 'Archivierte Menschen',
	'contacts.count': (p) => (p.count === 1 ? '1 Person' : `${p.count} Menschen`),
	'contacts.withThisTag': 'mit diesem Schlagwort',
	'contacts.archivedSuffix': ', aus den Listen, aber nicht verloren',
	'contacts.find': 'Jemanden finden',
	'contacts.findPlaceholder': 'Jemanden finden…',
	'contacts.all': 'Alle',
	'contacts.archivedChip': (p) => `Archiviert (${p.count})`,
	'contacts.archived': 'Archiviert',
	'contacts.private': 'privat',
	'contacts.lastWrittenAbout': 'Zuletzt beschrieben',
	'contacts.lastWrittenAboutOn': (p) => `Zuletzt beschrieben am ${p.date}`,
	'contacts.nothingWrittenYet': 'Noch nichts geschrieben',
	'contacts.noMatch': (p) => `Niemand passt zu „${p.query}“.`,
	'contacts.emptyArchive.title': 'Nichts archiviert',
	'contacts.emptyArchive.hint':
		'Archivieren nimmt jemanden aus den Listen, ohne ihn zu verlieren. Bisher ist niemand archiviert.',
	'contacts.emptyArchive.back': 'Zurück zu allen',
	'contacts.empty.title': 'Noch keine Menschen',
	'contacts.empty.hint':
		'Lege die erste Person an — alles andere in Stella hängt an einem Menschen.',

	'contacts.new.title': 'Person hinzufügen · Stella',
	'contacts.new.heading': 'Person hinzufügen',
	'contacts.new.intro': 'Ein Name genügt. Alles Weitere kann bis zu ihrer Seite warten.',
	'contacts.new.firstName': 'Vorname',
	'contacts.new.lastName': 'Nachname',
	'contacts.new.alreadyHere': 'Schon in Stella?',
	'contacts.new.reason.sameName': 'Gleicher Name — ist sie oder er das?',
	'contacts.new.reason.sameSurname': 'Gleicher Nachname',
	'contacts.new.reason.similarSurname': 'Ähnlicher Nachname',
	'contacts.new.linkAsRelative': 'Als verwandt verknüpfen',
	'contacts.new.relativeHint':
		'Nach dem Anlegen landest du im Beziehungseditor, mit dieser Person ausgewählt.',
	'contacts.new.description': 'Beschreibung',
	'contacts.new.descriptionHint': '(eine Zeile)',
	'contacts.new.descriptionPlaceholder': 'Marcos Schwester, am See kennengelernt',
	'contacts.new.howWeMet': 'Wie wir uns kennengelernt haben',
	'contacts.new.where': 'Wo',
	'contacts.new.wherePlaceholder': 'am See',
	'contacts.new.more': 'Mehr — Spitzname, Geburtstag',
	'contacts.new.nickname': 'Spitzname',
	'contacts.new.birthday': 'Geburtstag',
	'contacts.new.visibility': 'Sichtbarkeit'
};
