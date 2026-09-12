import type { ComponentsMessages } from '../en/components';

/** German for `messages/en/components.ts`. */
export const components: ComponentsMessages = {
	'components.saved': 'Gespeichert',
	'components.photo.add': 'Foto hinzufügen',
	'components.photo.change': 'Foto ändern',
	'components.photo.addShort': 'Hinzufügen',
	'components.photo.changeShort': 'Ändern',
	'components.photo.failed':
		'Das Foto konnte nicht hochgeladen werden. Versuche es mit einem JPEG- oder PNG-Bild.',
	'components.palette.jumpTo': 'Springen zu',
	'components.palette.placeholder': 'Zu einer Person springen oder etwas tun…',
	'components.palette.empty': 'Niemand mit diesem Namen.',
	'components.palette.write': 'Moment festhalten',
	'components.palette.addPerson': 'Person hinzufügen',
	'components.palette.searchEverything': (p) => `Überall nach „${p.query}“ suchen`,
	'components.palette.kindSearch': 'Suche',
	'components.palette.kindAction': 'Aktion',
	'components.personSearch.placeholder': 'Personen suchen…',
	'components.personSearch.empty': 'Niemand gefunden.',
	'components.personSearch.remove': (p) => `${p.name} entfernen`,
	'components.dateField.day': 'Tag',
	'components.dateField.month': 'Monat',
	'components.dateField.year': 'Jahr',
	'components.dateField.dayPlaceholder': 'TT',
	'components.dateField.yearPlaceholder': 'JJJJ',
	'components.dateField.monthEmpty': 'Monat…',
	'components.dateField.yearOptional': 'Lass das Jahr leer, wenn du es nicht weißt.',
	'components.dateField.noSuchDay': 'Diesen Tag gibt es im Kalender nicht.',
	'components.dateField.incomplete': 'Gib das ganze Datum ein oder lösche es.',
	'components.dateField.inFuture': 'Dieser Tag ist noch nicht gewesen.'
};
