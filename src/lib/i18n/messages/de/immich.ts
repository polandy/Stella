import type { ImmichMessages } from '../en/immich';

/** German for `messages/en/immich.ts`. */
export const immich: ImmichMessages = {
	'immich.error.personGone': 'Diese Person gibt es in Immich nicht mehr.',
	'immich.error.linkedTo': (p) => `Dieses Gesicht ist schon mit ${p.name} verknüpft.`,
	'immich.error.linkedElsewhere': 'Dieses Gesicht ist schon mit einer anderen Person in Stella verknüpft.',
	'immich.error.unreachable': 'Immich hat nicht geantwortet. Versuch es gleich noch einmal.',
	'immich.error.keyRejected': 'Immich hat Stellas Schlüssel abgelehnt. Ein Admin muss ihn prüfen.',
	'immich.error.missingScope': (p) =>
		`Stellas Schlüssel darf das in Immich nicht – er braucht ${p.scope}.`,

	'immich.settings.heading': 'Immich',
	'immich.settings.checking': 'Frage Immich…',
	'immich.settings.connected': (p) => `Verbunden mit dem Immich von ${p.owner} · ${p.version}`,
	'immich.settings.unreachable': 'Immich hat nicht geantwortet. Stella versucht es gleich wieder.',
	'immich.settings.keyRejected':
		'Immich hat den Schlüssel abgelehnt – vielleicht wurde er gelöscht oder falsch eingetragen.',
	'immich.settings.scope.user.read':
		'Der Schlüssel kann nicht sehen, wem das Konto gehört – er braucht user.read.',
	'immich.settings.scope.person.read': 'Der Schlüssel kann keine Personen lesen – er braucht person.read.',
	'immich.settings.scope.person.statistics':
		'Der Schlüssel kann keine Fotos zählen – er braucht person.statistics.',
	'immich.settings.scope.asset.read': 'Der Schlüssel kann keine Fotos auflisten – er braucht asset.read.',
	'immich.settings.scope.asset.view': 'Der Schlüssel kann keine Fotos zeigen – er braucht asset.view.',
	'immich.settings.tooOld': (p) =>
		`Dieses Immich hat Version ${p.version}. Stella braucht Immich 3.2 oder neuer.`,
	'immich.settings.sharing':
		'Alle im Haushalt sehen die Fotos der Personen, die mit dieser Bibliothek verknüpft sind.',
	'immich.settings.howToLink': 'Verknüpfe eine Person im Menü der Fotos-Karte auf ihrer Seite.',

	'immich.menu.label': 'Immich-Optionen',
	'immich.menu.trigger': 'Immich',
	'immich.menu.find': 'In Immich suchen',
	'immich.menu.unlink': 'Verknüpfung mit Immich lösen',
	'immich.row.label': 'In Immich',
	'immich.row.photos': (p) => `In Immich · ${p.shown} ${p.count === 1 ? 'Foto' : 'Fotos'}`,
	'immich.row.asking': 'Frage Immich…',
	'immich.row.unreachable': 'Immich hat nicht geantwortet.',
	'immich.row.gone': 'Diese Person gibt es in Immich nicht mehr.',
	'immich.row.unlinkQuestion': 'Verknüpfung lösen?',
	'immich.row.open': 'In Immich öffnen',

	'immich.strip.label': 'Neueste Fotos in Immich',
	'immich.strip.loading': 'Lade Fotos aus Immich…',
	'immich.strip.photo': (p) => `Foto vom ${p.date}, in Immich`,
	'immich.strip.undated': 'Foto in Immich',
	'immich.strip.showMore': 'Mehr zeigen',
	'immich.viewer.dialog': 'Foto aus Immich',
	'immich.viewer.position': (p) => `${p.at} von ${p.count}`,
	'immich.viewer.previous': 'Vorheriges Foto',
	'immich.viewer.next': 'Nächstes Foto',
	'immich.viewer.use': 'Als Foto verwenden',
	'immich.viewer.useFailed': 'Das Foto konnte nicht übernommen werden. Lade die Seite neu und versuche es noch einmal.',

	'immich.picker.title': (p) => `${p.name} in Immich suchen`,
	'immich.picker.search': 'Name in Immich',
	'immich.picker.searching': 'Suche in Immich…',
	'immich.picker.none':
		'Kein Gesicht in Immich hat diesen Namen. Versuch eine andere Schreibweise oder benenne das Gesicht zuerst in Immich.',
	'immich.picker.hint': 'Wähle das Gesicht, das diese Person ist.',
	'immich.picker.linkedTo': (p) => `Mit ${p.name} verknüpft`,
	'immich.picker.linkedElsewhere': 'Mit jemand anderem verknüpft',
	'immich.picker.link': (p) => `${p.immichName} mit ${p.name} verknüpfen`
};
