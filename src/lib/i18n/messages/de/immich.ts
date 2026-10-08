import type { ImmichMessages } from '../en/immich';

/** German for `messages/en/immich.ts`. */
export const immich: ImmichMessages = {
	'immich.error.personGone': 'Diese Person gibt es in Immich nicht mehr.',
	'immich.error.linkedTo': (p) => `Dieses Gesicht ist schon mit ${p.name} verknüpft.`,
	'immich.error.contactLinked': (p) => `${p.name} ist schon verknüpft.`,
	'immich.error.linkedElsewhere':
		'Dieses Gesicht ist schon mit einer anderen Person in Stella verknüpft.',
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
	'immich.settings.scope.person.read':
		'Der Schlüssel kann keine Personen lesen – er braucht person.read.',
	'immich.settings.scope.person.statistics':
		'Der Schlüssel kann keine Fotos zählen – er braucht person.statistics.',
	'immich.settings.scope.asset.read':
		'Der Schlüssel kann keine Fotos auflisten – er braucht asset.read.',
	'immich.settings.scope.asset.view':
		'Der Schlüssel kann keine Fotos zeigen – er braucht asset.view.',
	'immich.settings.tooOld': (p) =>
		`Dieses Immich hat Version ${p.version}. Stella braucht Immich 3.2 oder neuer.`,
	'immich.settings.sharing':
		'Alle im Haushalt sehen die Fotos der Personen, die mit dieser Bibliothek verknüpft sind.',
	'immich.settings.howToLink': 'Verknüpfe eine Person im Menü der Fotos-Karte auf ihrer Seite.',

	'immich.match.title': 'Deine Leute finden',
	'immich.match.blurb': 'Verknüpfe die Personen in Stella mit ihren Gesichtern in Immich.',
	'immich.match.intro':
		'In Immich benannte Gesichter, neben den Personen in Stella mit demselben Namen. Verknüpfe, wer dieselbe Person ist – das Gesicht sagt es dir.',
	'immich.match.asking': 'Frage Immich nach seinen Personen…',
	'immich.match.linkAll': (p) => `Alle wahrscheinlichen verknüpfen (${p.count})`,
	'immich.match.maybeOne': (p) => `Ist das ${p.name}?`,
	'immich.match.maybeMany': (p) => `Wer davon ist ${p.name}?`,
	'immich.match.link': 'Verknüpfen',
	'immich.match.face': (p) => `${p.name} in Immich`,
	'immich.match.inImmich': (p) => `In Immich: ${p.name}`,
	'immich.match.photos': (p) => `${p.shown} ${p.count === 1 ? 'Foto' : 'Fotos'}`,
	'immich.match.skip': 'Später',
	'immich.match.skipLabel': (p) => `Später: ${p.name}`,
	'immich.match.linked': (p) =>
		p.count === 1 ? '1 Person verknüpft.' : `${p.count} Personen verknüpft.`,
	'immich.match.ignore': 'Ignorieren',
	'immich.match.ignoreLabel': (p) => `Vorschlag für ${p.name} ignorieren`,
	'immich.match.ignoredToast': 'Vorschlag ignoriert',
	'immich.match.ignoredHeading': (p) => `Ignoriert (${p.count})`,
	'immich.match.ignoredBy': (p) => `Ignoriert von ${p.name} am ${p.date}`,
	'immich.match.formerMember': 'einem früheren Mitglied',
	'immich.match.unnamedFace': 'in Immich nicht mehr benannt',
	'immich.match.proposeAgain': 'Wieder vorschlagen',
	'immich.match.proposeAgainLabel': (p) => `Wieder vorschlagen: ${p.name}`,
	'immich.match.proposedAgainToast': 'Wird wieder vorgeschlagen',
	'immich.match.done': 'Das sind für jetzt alle.',
	'immich.match.doneHint': 'Benenne weitere Gesichter in Immich und schau dann noch einmal.',
	'immich.match.again': 'Nochmals suchen',

	'immich.hint.label': (p) => `Vorschlag aus Immich für ${p.name}`,
	'immich.hint.question': (p) => `Ist das ${p.name}?`,
	'immich.hint.has': (p) =>
		`Immich kennt „${p.immichName}“ mit ${p.shown} ${p.count === 1 ? 'Foto' : 'Fotos'}.`,
	'immich.hint.hasUncounted': (p) => `Immich kennt „${p.immichName}“.`,
	'immich.hint.choose': 'Andere wählen',
	'immich.tabs.label': 'Was durchsehen',
	'immich.tabs.matching': 'Abgleich',
	'immich.tabs.new': 'Neu aus Immich',
	'immich.new.intro':
		'Gesichter, die in Immich einen Namen haben, in Stella aber noch keine verknüpfte Person.',
	'immich.new.summary': (p) =>
		`${p.shown} ${p.count === 1 ? 'Name' : 'Namen'} aus Immich, die meisten Fotos zuerst`,
	'immich.new.assign': 'Zuordnen…',
	'immich.new.assignLabel': (p) => `${p.name} zuordnen`,
	'immich.new.ignoreLabel': (p) => `${p.name} ignorieren`,
	'immich.new.ignoredToast': (p) => `${p.name} ignoriert`,
	'immich.new.compareOne': 'In Stella gibt es eine Person mit ähnlichem Namen. Ist es dieselbe?',
	'immich.new.compareMany':
		'In Stella gibt es Personen mit ähnlichem Namen. Ist eine davon dieselbe?',
	'immich.new.openInImmich': 'In Immich ansehen',
	'immich.new.theirPhoto': (p) => `${p.name} in Stella`,
	'immich.new.thisIsThem': 'Ist diese Person',
	'immich.new.thisIsThemLabel': (p) => `${p.immichName} ist ${p.name}`,
	'immich.new.linkedTo': (p) => `Schon verknüpft mit „${p.name}“ in Immich`,
	'immich.new.linkedToUnnamed': 'Schon mit einem anderen Gesicht in Immich verknüpft',
	'immich.new.replaceQuestion': (p) =>
		`${p.name} ist schon mit einem anderen Gesicht verknüpft. Stattdessen dieses verknüpfen?`,
	'immich.new.replace': 'Stattdessen dieses verknüpfen',
	'immich.new.createInstead': 'Nein, neue Person anlegen',
	'immich.new.back': 'Zurück zum Vergleich',
	'immich.new.kinHint': (p) => `„${p.nickname}“ als Spitzname vorgeschlagen.`,
	'immich.new.usePhoto': 'Gesicht aus Immich als Foto übernehmen',
	'immich.new.add': 'Anlegen und verknüpfen',
	'immich.new.findInStella': 'Doch schon in Stella? Person suchen',
	'immich.new.findPlaceholder': 'Personen in Stella suchen',
	'immich.new.added': (p) => `${p.name} angelegt`,
	'immich.new.open': 'Öffnen',
	'immich.new.assigned': (p) => `${p.immichName} mit ${p.name} verknüpft`,
	'immich.new.photoFailed':
		'Die Person ist angelegt, aber das Gesicht konnte nicht als Foto übernommen werden.',
	'immich.new.done': 'Alle benannten Gesichter sind in Stella.',
	'immich.new.showMore': (p) => `${p.count} weitere zeigen`,

	'immich.menu.label': 'Fotobibliothek-Optionen',
	'immich.menu.trigger': 'Fotobibliothek',
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
	'immich.viewer.use': 'Als Foto verwenden',
	'immich.viewer.useFailed':
		'Das Foto konnte nicht übernommen werden. Lade die Seite neu und versuche es noch einmal.',

	'immich.together.label': 'Wessen Fotos',
	'immich.together.own': (p) => p.name,
	'immich.together.withYou': (p) => `Du und ${p.name}`,
	'immich.together.pair': (p) => `${p.first} und ${p.second}`,
	'immich.together.stripWithYou': (p) => `Fotos von dir und ${p.name} zusammen, in Immich`,
	'immich.together.stripPair': (p) => `Fotos von ${p.first} und ${p.second} zusammen, in Immich`,
	'immich.together.none': 'In Immich gibt es noch keine Fotos von den beiden zusammen.',
	'immich.together.row': 'Zusammen',
	'immich.together.rowLabelWithYou': (p) => `Fotos von dir und ${p.name} zusammen zeigen`,
	'immich.together.rowLabelPair': (p) => `Fotos von ${p.first} und ${p.second} zusammen zeigen`,

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
