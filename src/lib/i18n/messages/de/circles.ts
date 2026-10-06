import type { CirclesMessages } from '../en/circles';

/** German for `messages/en/circles.ts`. */
export const circles: CirclesMessages = {
	'circles.title': 'Kreise · Stella',
	'circles.heading': 'Kreise',
	'circles.intro':
		'Die Zusammenhänge, die Menschen teilen — eine Klasse, ein Verein, ein Team, ein Chor.',
	'circles.new': 'Neuer Kreis',
	'circles.create': 'Kreis anlegen',
	'circles.name': 'Name',
	'circles.namePlaceholder': 'z. B. Kegelclub Bühl',
	'circles.kindLabel': 'Art',
	'circles.descriptionLabel': 'Beschreibung (optional)',
	'circles.colour': 'Farbe',
	'circles.find': 'Kreis finden',
	'circles.findPlaceholder': 'Kreis finden…',
	'circles.empty.title': 'Noch keine Kreise',
	'circles.empty.hint':
		'Ein Kreis ist ein Zusammenhang, den Menschen teilen. Lege den ersten an und setze Menschen hinein.',
	'circles.noMatch.title': 'Kein Kreis passt',
	'circles.noMatch.hint':
		'Versuche einen Teil des Namens oder ein Wort aus der Beschreibung — oder leg den Kreis gleich an.',
	'circles.noMatch.create': (p) => `„${p.name}“ anlegen`,
	'circles.memberCount': (p) => (p.count === 1 ? '1 Mitglied' : `${p.count} Mitglieder`),
	'circles.nobodyYet': 'Noch niemand darin',
	'circles.private': 'privat',
	'circles.detail.title': (p) => `${p.name} · Kreise · Stella`,
	'circles.members': 'Mitglieder',
	'circles.addPeople': 'Personen hinzufügen',
	'circles.people': 'Personen',
	'circles.roleAppliesToAll': 'Gilt für alle Gewählten.',
	'circles.roleLabel': 'Rolle (optional)',
	'circles.rolePlaceholder': 'Mitglied',
	'circles.removeMember': (p) => `${p.name} aus dem Kreis entfernen`,
	'circles.removedFromCircle': 'Aus dem Kreis entfernt',
	'circles.noRole': 'Ohne Rolle',
	'circles.renameRole': (p) => `Rolle ${p.role} umbenennen`,
	'circles.keepSearch': 'Suche nach dem Auswählen behalten',
	'circles.select': 'Auswählen',
	'circles.selectDone': 'Auswahl beenden',
	'circles.selectMember': (p) => `${p.name} auswählen`,
	'circles.selectRole': (p) => `Alle mit Rolle ${p.role} auswählen`,
	'circles.selectAll': 'alle',
	'circles.selectedCount': (p) => `${p.count} ausgewählt`,
	'circles.selectNone': 'Niemand ausgewählt',
	'circles.selectEveryone': 'Alle',
	'circles.selectNoOne': 'Keine',
	'circles.bulkRole': 'Rolle setzen',
	'circles.bulkRoleHint': 'Rolle (leer = keine)',
	'circles.bulkApply': 'Übernehmen',
	'circles.bulkRemove': 'Entfernen',
	'circles.removedManyFromCircle': (p) => `${p.count} aus dem Kreis entfernt`,
	'circles.noMembers.title': 'Noch niemand in diesem Kreis',
	'circles.noMembers.add': 'Erste Mitglieder hinzufügen',
	'circles.noMembers.hint':
		'Füge die Menschen hinzu, die diesen Zusammenhang teilen; bei jedem von ihnen erscheint er auf der Seite.',
	// Die Fotos eines Kreises (docs/02 §2.4.2).
	'circles.photos.title': 'Fotos',
	'circles.photos.add': 'Fotos hinzufügen',
	'circles.photos.none': 'Noch keine Fotos von diesem Kreis.',
	'circles.photos.filter': 'Fotos zeigen von',
	'circles.photos.all': 'Alle',
	'circles.photos.pictures': 'Bilder',
	'circles.photos.whoIsIn': 'Wer ist darauf?',
	'circles.photos.roleHint': (p) => `Sie stehen über der Gruppe ${p.role}.`,
	'circles.photos.noRoleHint': 'Ohne Rolle kann ein Foto zum Titelbild des Kreises werden.',
	'circles.photos.whoCanSee': 'Wer darf sie sehen?',
	'circles.photos.adding': 'Wird hinzugefügt…',
	'circles.photos.addCount': (p) =>
		p.count === 0
			? 'Hinzufügen'
			: p.count === 1
				? '1 Foto hinzufügen'
				: `${p.count} Fotos hinzufügen`,
	'circles.photos.uploadFailed': 'Diese Fotos konnten nicht hinzugefügt werden.',
	'circles.photos.of': (p) => `Foto von ${p.name}`,
	'circles.photos.ofRole': (p) => `Foto von ${p.name}: ${p.role}`,
	'circles.photos.openCover': (p) =>
		p.count === 1 ? 'Titelbild öffnen' : `Titelbild öffnen, 1 von ${p.count}`,
	'circles.photos.openRole': (p) =>
		p.count === 1 ? `Foto von ${p.role} öffnen` : `Die ${p.count} Fotos von ${p.role} öffnen`,
	'circles.photos.position': (p) => `${p.at} von ${p.count}`,
	'circles.photos.addedBy': (p) => `Hinzugefügt am ${p.date} von ${p.name}`,
	'circles.photos.role': 'Rolle',
	'circles.photos.saveRole': 'Rolle setzen',
	'circles.photos.ownerOnly': 'Nur du kannst das, weil du es hinzugefügt hast:',
	'circles.photos.previous': 'Vorheriges Foto',
	'circles.photos.next': 'Nächstes Foto',
	// Ein Profilbild, aus einem Gruppenfoto geschnitten (docs/concepts/circle-photos.md §5).
	'circles.cut.use': 'Als Profilbild verwenden für …',
	'circles.cut.dialog': 'Als Profilbild verwenden',
	'circles.cut.whom': 'Wessen Profilbild ist auf diesem Foto?',
	'circles.cut.search': 'Alle durchsuchen',
	'circles.cut.restOfCircle': 'Weitere in diesem Kreis',
	'circles.cut.inCircle': 'In diesem Kreis',
	'circles.cut.everyone': 'Alle anderen',
	'circles.cut.searchHint': 'Tippe einen Namen, um jemanden außerhalb dieses Kreises zu finden.',
	'circles.cut.nobody': 'Niemand mit diesem Namen.',
	'circles.cut.wears': 'Trägt einen Ausschnitt dieses Fotos',
	'circles.cut.loading': 'Das ganze Bild wird geladen…',
	'circles.cut.done': (p) => `${p.name} trägt jetzt dieses Foto.`,
	'circles.cut.next': 'Nächste Person',
	'circles.cut.finish': 'Fertig',
	'circles.cut.failed': 'Das Profilbild konnte nicht gespeichert werden.',
	'circles.cut.wornBy': (p) =>
		p.count === 1
			? 'Dieses Foto ist das Profilbild von 1 Person.'
			: `Dieses Foto ist das Profilbild von ${p.count} Personen.`,
	'circles.cut.removeKeeps': 'Sie behalten es als eigenes Foto.',
	'circles.cut.privateKeeps': 'Sie behalten es als eigenes, geteiltes Foto.',
	'circles.cut.removeAnyway': 'Trotzdem entfernen',
	'circles.cut.privateAnyway': 'Trotzdem privat machen',
	'circles.kind.all': 'Alle',
	'circles.kind.friends': 'Freundeskreis',
	'circles.kind.family': 'Familie',
	'circles.kind.school': 'Schule',
	'circles.kind.class': 'Klasse',
	'circles.kind.course': 'Kurs',
	'circles.kind.club': 'Verein',
	'circles.kind.team': 'Team',
	'circles.kind.work': 'Arbeit',
	'circles.kind.neighborhood': 'Nachbarschaft',
	'circles.kind.other': 'Sonstiges',
	'circles.matchCount': (p: { count: number }) =>
		p.count === 0
			? 'Keine Kreise gefunden'
			: p.count === 1
				? '1 Kreis gefunden'
				: `${p.count} Kreise gefunden`
};
