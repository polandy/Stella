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
	// Das ⋯-Menü der Kreisseite und das Bearbeiten eines Kreises (docs/02 §2.4.2).
	'circles.menu': 'Weitere Aktionen',
	'circles.edit.open': 'Kreis bearbeiten',
	'circles.edit.label': (p) => `${p.name} bearbeiten`,
	'circles.edit.period': 'Zeitraum (optional)',
	'circles.edit.start': 'Beginnt',
	'circles.edit.end': 'Endet',
	// Einen Kreis löschen: der Eintrag im ⋯-Menü und sein Bestätigungsschritt (docs/02 §2.4.2).
	'circles.delete.open': 'Kreis löschen…',
	'circles.delete.label': (p) => `${p.name} löschen?`,
	'circles.delete.counting': 'Zähle, was wegfällt…',
	'circles.delete.explain': (p) => {
		const goes = [
			p.members === 0
				? null
				: p.members === 1
					? '1 Mitglied verlässt ihn'
					: `${p.members} Mitglieder verlassen ihn`,
			p.photos === 0
				? null
				: p.photos === 1
					? 'sein Foto wird gelöscht'
					: `seine ${p.photos} Fotos werden gelöscht`
		].filter((part) => part !== null);
		return goes.length === 0
			? `Damit wird ${p.name} gelöscht. Das lässt sich nicht rückgängig machen.`
			: `Damit wird ${p.name} gelöscht: ${goes.join(' und ')}. Das lässt sich nicht rückgängig machen.`;
	},
	'circles.delete.unknown': (p) =>
		`Damit wird ${p.name} gelöscht: Alle verlassen ihn und seine Fotos werden gelöscht. Das lässt sich nicht rückgängig machen.`,
	'circles.delete.worn': (p) =>
		`${p.photos === 1 ? '1 seiner Fotos ist' : `${p.photos} seiner Fotos sind`} das Profilbild von ${p.people === 1 ? '1 Person' : `${p.people} Personen`}. Sie behalten es als eigenes Foto.`,
	'circles.delete.children': (p) =>
		`${p.list} ${p.count === 1 ? 'bleibt' : 'bleiben'}, ohne übergeordneten Kreis.`,
	'circles.delete.unnamedChildren': (p) =>
		p.more
			? p.count === 1
				? '1 weiterer Kreis'
				: `${p.count} weitere Kreise`
			: p.count === 1
				? '1 Kreis darin'
				: `${p.count} Kreise darin`,
	'circles.delete.submit': (p) => `${p.name} löschen`,
	'circles.delete.keep': 'Doch behalten',
	'circles.delete.done': (p) => `${p.name} gelöscht`,
	'circles.period.range': (p) => `${p.start} – ${p.end}`,
	'circles.period.from': (p) => `ab ${p.start}`,
	'circles.period.until': (p) => `bis ${p.end}`,
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
	// Ein Profilbild, aus einem Gruppenfoto geschnitten (docs/02 §2.14).
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
				: `${p.count} Kreise gefunden`,
	'circles.sub.count': (p) => (p.count === 1 ? '1 Unterkreis' : `${p.count} Unterkreise`),
	'circles.sub.inside': (p) => `+${p.count} darin`,
	'circles.sub.more': (p) => `+${p.count} weitere`,
	'circles.sub.showPast': (p) =>
		p.count === 1 ? '1 vergangenen anzeigen' : `${p.count} vergangene anzeigen`,
	'circles.sub.hidePast': 'Vergangene ausblenden',
	'circles.sub.heading': 'Unterkreise',
	'circles.sub.noPeriod': 'ohne Zeitraum',
	'circles.sub.today': 'heute',
	'circles.sub.siblings': 'Benachbarte Kreise',
	'circles.sub.previous': (p) => `Vorheriger: ${p.name}`,
	'circles.sub.next': (p) => `Nächster: ${p.name}`,
	'circles.sub.directlyNobody': (p) =>
		`Direkt gehört niemand zu ${p.name} — die Personen sind in den Unterkreisen.`,
	'circles.sub.empty': 'Noch keine Unterkreise.',
	'circles.sub.create': 'Unterkreis anlegen',
	'circles.sub.createLabel': (p) => `Neuer Unterkreis von ${p.name}`,
	'circles.sub.addExisting': 'Vorhandenen hinzufügen',
	'circles.sub.actions': (p) => `Aktionen für ${p.name}`,
	'circles.sub.detach': (p) => `Aus ${p.parent} lösen`,
	'circles.sub.detached': (p) => `${p.name} steht jetzt für sich`,
	'circles.sub.added': (p) => `${p.name} liegt jetzt in ${p.parent}`,
	'circles.sub.undoFailed': 'Das ließ sich nicht zurücknehmen. Der Kreis bleibt, wo er jetzt ist.',
	'circles.sub.placeholder.class': 'z. B. Klasse 3a',
	'circles.sub.placeholder.team': 'z. B. U12',
	'circles.parent.label': 'Gehört zu',
	'circles.parent.labelOptional': 'Gehört zu (optional)',
	'circles.parent.none': 'Keiner',
	'circles.parent.standsAlone': 'steht für sich',
	'circles.parent.path': (p) => `in ${p.path}`,
	'circles.parent.choose': (p) => `Gehört zu: ${p.current}. Anderen wählen`,
	'circles.parent.help':
		'Etwa eine Klasse zu ihrer Schule. Mitglieder und Fotos bleiben, wo sie sind.',
	'circles.parent.detach': 'Herauslösen',
	'circles.parent.privateNote': (p) =>
		`${p.parent} ist privat. Alle anderen sehen ${p.name} weiter als eigenen Kreis.`,
	'circles.parent.savedInside': (p) => `Gespeichert · liegt jetzt in ${p.parent}`,
	'circles.parent.savedAlone': 'Gespeichert · steht jetzt für sich',
	'circles.picker.parentTitle': 'Gehört zu',
	'circles.picker.parentSubtitle': (p) => `Wo gehört ${p.name} hin?`,
	'circles.picker.parentSubtitleNew': 'Wo gehört der neue Kreis hin?',
	'circles.picker.addTitle': 'Vorhandenen Kreis hinzufügen',
	'circles.picker.addSubtitle': (p) => `Welcher Kreis kommt in ${p.name}?`,
	'circles.picker.search': 'Kreise suchen',
	'circles.picker.noMatch': 'Kein Kreis passt.',
	'circles.picker.self': 'dieser Kreis',
	'circles.picker.inside': (p) => `liegt in ${p.name}`,
	'circles.picker.contains': (p) => `enthält ${p.name}`,
	'circles.picker.alreadyIn': 'schon darin',
	'circles.picker.movesFrom': (p) => `jetzt in ${p.name} – wird verschoben`,
	'circles.picker.footer':
		'Ein Kreis kann nicht in sich selbst oder einem seiner Unterkreise liegen.',
	'circles.arrange.open': 'Personen ordnen',
	'circles.arrange.title': (p) => `Personen ordnen · ${p.name}`,
	'circles.arrange.heading': 'Personen ordnen',
	'circles.arrange.back': (p) => `Zurück zu ${p.name}`,
	'circles.arrange.summary': (p) =>
		`${p.name} und ${p.subCircles === 1 ? '1 Unterkreis' : `${p.subCircles} Unterkreise`} · ${
			p.people === 1 ? '1 Person' : `${p.people} Personen`
		}`,
	'circles.arrange.cards': 'Kreise und die Personen, die direkt darin sind',
	'circles.arrange.modeLabel': 'Beim Ziehen',
	'circles.arrange.move': 'Verschieben',
	'circles.arrange.copy': 'Kopieren',
	'circles.arrange.hintMove':
		'Personen ziehen oder antippen und ein Ziel wählen · Alt beim Ablegen: stattdessen kopieren',
	'circles.arrange.hintCopy':
		'Personen ziehen oder antippen und ein Ziel wählen · Alt beim Ablegen: stattdessen verschieben',
	'circles.arrange.direct': (p) => `Direkt in ${p.name}`,
	'circles.arrange.itself': 'Der Kreis selbst',
	'circles.arrange.count': (p) => (p.count === 1 ? '1 Person' : `${p.count} Personen`),
	'circles.arrange.empty': 'Noch niemand. Personen hierher ziehen.',
	'circles.arrange.alsoIn': (p) => `auch in ${p.names}`,
	'circles.arrange.dropMove': (p) =>
		`Hierher verschieben · ${p.count === 1 ? '1 Person' : `${p.count} Personen`}`,
	'circles.arrange.dropCopy': (p) =>
		`Hierher kopieren · ${p.count === 1 ? '1 Person' : `${p.count} Personen`}`,
	'circles.arrange.alreadyHere': 'Schon hier',
	'circles.arrange.alreadyAllHere': 'Schon alle hier',
	'circles.arrange.selected': (p) => `${p.count} ausgewählt`,
	'circles.arrange.moveTo': 'Verschieben nach …',
	'circles.arrange.copyTo': 'Kopieren nach …',
	'circles.arrange.clear': 'Auswahl aufheben',
	'circles.arrange.pickMove': 'Ziel antippen: wohin verschieben?',
	'circles.arrange.pickCopy': 'Ziel antippen: wohin kopieren?',
	'circles.arrange.cancel': 'Abbrechen',
	'circles.arrange.hereMove': 'Hierher verschieben',
	'circles.arrange.hereCopy': 'Hierher kopieren',
	'circles.arrange.moved': (p) =>
		`${p.count === 1 ? '1 Person' : `${p.count} Personen`} nach ${p.target} verschoben`,
	'circles.arrange.copied': (p) =>
		`${p.count === 1 ? '1 Person' : `${p.count} Personen`} nach ${p.target} kopiert`,
	'circles.arrange.alreadyThere': (p) => `${p.count} schon dort`,
	'circles.arrange.onlyRemoved': (p) =>
		`${p.count === 1 ? '1 Person' : `${p.count} Personen`} schon in ${p.target}, am alten Ort entfernt`,
	'circles.arrange.undone': 'Rückgängig gemacht',
	'circles.arrange.undonePartly': (p) =>
		`Rückgängig gemacht · ${p.count} unverändert gelassen, weil sie sich inzwischen geändert haben`,
	'circles.arrange.undoFailed': 'Das ließ sich nicht rückgängig machen. Nichts wurde geändert.'
};
