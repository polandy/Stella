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
	'components.personSearch.remove': (p) => `${p.name} entfernen`
};
