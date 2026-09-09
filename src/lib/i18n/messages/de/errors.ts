import type { ErrorsMessages } from '../en/errors';

/** German for `messages/en/errors.ts`. */
export const errors: ErrorsMessages = {
	'errors.contact.birthDateFormat':
		'Ein Geburtsdatum muss JJJJ-MM-TT lauten — oder --MM-TT, wenn das Jahr unbekannt ist.',
	'errors.contact.emptyName': 'Ein Name darf nicht leer sein.',
	'errors.contact.needAName': 'Bitte gib wenigstens einen Namen oder Spitznamen ein.',
	'errors.form.checkAndRetry': 'Bitte prüfe das Formular und versuche es erneut.',

	'errors.relationship.duplicate': 'Diese Beziehung gibt es schon.',
	'errors.relationship.noSuchDay': (p) => `${p.day} ist kein Tag, den es gibt.`,
	'errors.relationship.currentOrFormer': 'Eine Beziehung ist entweder aktuell oder ehemalig.',

	'errors.relationshipType.needsLabel': 'Eine Beziehungsart braucht eine Bezeichnung.',
	'errors.relationshipType.needsBothLabels':
		'Eine Art, die sich von beiden Seiten unterschiedlich liest, braucht beide Bezeichnungen.',
	'errors.relationshipType.labelTooLong': (p) =>
		`Eine Bezeichnung darf höchstens ${p.max} Zeichen lang sein.`,
	'errors.relationshipType.unknownCategory': (p) => `${p.category} ist keine Beziehungskategorie.`,
	'errors.relationshipType.unnameable': (p) =>
		`„${p.label}“ enthält keine Buchstaben oder Ziffern, nach denen sich benennen ließe.`,
	'errors.relationshipType.taken': (p) => `Eine Beziehungsart wie „${p.label}“ gibt es schon.`,
	'errors.relationshipType.builtIn':
		'Die mitgelieferten Beziehungsarten lassen sich weder ändern noch entfernen.',
	'errors.relationshipType.inUse': (p) =>
		p.count === 1
			? '1 Beziehung nutzt diese Art noch. Ändere sie zuerst.'
			: `${p.count} Beziehungen nutzen diese Art noch. Ändere sie zuerst.`,

	'errors.date.unknownKind': (p) => `Unbekannte Art von Datum: ${p.kind}`,
	'errors.date.format': 'Ein Datum muss JJJJ-MM-TT lauten — oder --MM-TT ohne Jahr.',
	'errors.date.noSuchDay': (p) => `Diesen Tag gibt es im Kalender nicht: ${p.day}.`,
	'errors.date.needsLabel': 'Gib dem Datum einen Namen, damit es später etwas bedeutet.',
	'errors.date.couldNotAdd': 'Das Datum konnte nicht hinzugefügt werden.',

	'errors.interaction.unknownKind': (p) => `Unbekannte Art von Kontakt: ${p.kind}`,
	'errors.interaction.dayFormat': 'Der Tag muss JJJJ-MM-TT lauten.',
	'errors.interaction.noSuchDay': (p) => `Diesen Tag gibt es im Kalender nicht: ${p.day}.`,
	'errors.interaction.selfParticipant':
		'Die Person, um die es geht, kann nicht zugleich beteiligt sein.',
	'errors.interaction.couldNotLog': 'Der Kontakt konnte nicht festgehalten werden.',

	'errors.moment.couldNotSave': 'Der Moment konnte nicht gespeichert werden.',
	'errors.moment.needsPerson':
		'Erwähne mit @ mindestens eine Person, damit der Moment einen Ort hat.',

	'errors.image.empty': 'Das Bild ist leer.',
	'errors.image.tooLarge': 'Das Bild ist zu groß.',
	'errors.image.thumbEmpty': 'Das Vorschaubild ist leer.',
	'errors.image.thumbTooLarge': 'Das Vorschaubild ist zu groß.',
	'errors.image.unsupportedFormat': 'Nicht unterstütztes Bildformat.',
	'errors.image.formatMismatch': 'Das Format des Vorschaubilds passt nicht.',
	'errors.image.dimensions': 'Ungültige Bildabmessungen.',
	'errors.image.couldNotStore': 'Das Foto konnte nicht gespeichert werden.',
	'errors.caption.tooLong': (p) => `Eine Bildunterschrift darf höchstens ${p.max} Zeichen haben.`,

	'errors.moment.needText': 'Schreib zuerst, was passiert ist.',
	'errors.moment.badDay': 'Bitte wähle einen gültigen Tag.',
	'errors.moment.photoFailed':
		'Der Moment wurde gespeichert, ein Foto ließ sich aber nicht hinzufügen.',
	'errors.journal.badDay': 'Bitte wähle ein gültiges Datum.',
	'errors.journal.photoFailed':
		'Der Eintrag wurde gespeichert, ein Foto ließ sich aber nicht hinzufügen.',
	'errors.circle.needCircleName': 'Bitte gib dem Kreis einen Namen.',
	'errors.circle.choosePerson': 'Bitte wähle eine Person.',
	'errors.relationshipType.gone': 'Diese Beziehungsart gibt es nicht mehr.',
	'errors.notFound': 'Nicht gefunden',
	'errors.notSignedIn': 'Nicht angemeldet',
	'errors.person.notFound': 'Diese Person war nicht zu finden.',
	'errors.contact.notFound': 'Kontakt nicht gefunden',
	'errors.merge.choose': 'Wähle, wer zusammengeführt werden soll.',
	'errors.merge.failed': 'Diese Person konnte nicht zusammengeführt werden.',
	'errors.relationship.needPersonAndType': 'Bitte wähle eine Person und eine Beziehungsart.',
	'errors.relationship.couldNotAdd': 'Die Beziehung konnte nicht hinzugefügt werden.',
	'errors.relationship.couldNotSave': 'Die Beziehung konnte nicht gespeichert werden.',
	'errors.relationship.notFound': 'Diese Beziehung war nicht zu finden.',
	'errors.relationship.badSuggestion': 'Dieser Vorschlag war nicht zu lesen.',
	'errors.note.empty': 'Bitte schreibe etwas, bevor du speicherst.',
	'errors.note.couldNotSave': 'Die Notiz konnte nicht gespeichert werden.',
	'errors.field.needKindAndValue': 'Bitte wähle eine Art und gib einen Wert ein.',
	'errors.field.couldNotAdd': 'Die Angabe konnte nicht hinzugefügt werden.',
	'errors.date.needKindAndDay': 'Bitte wähle eine Art und einen Tag.',
	'errors.interaction.needKindAndDay': 'Bitte wähle, was passiert ist und an welchem Tag.',
	'errors.interaction.participantNotFound': 'Eine der beteiligten Personen war nicht zu finden.',
	'errors.interaction.onlyLogger': 'Nur wer den Kontakt festgehalten hat, kann ihn entfernen.',
	'errors.journal.onlyAuthor': 'Nur wer ihn geschrieben hat, kann ihn entfernen.',
	'errors.tag.needName': 'Bitte gib einen Namen für das Schlagwort ein.',
	'errors.tag.couldNotAdd': 'Das Schlagwort konnte nicht hinzugefügt werden.',
	'errors.image.chooseSome': 'Bitte wähle mindestens ein Bild.',
	'errors.image.chooseOne': 'Bitte wähle ein Bild.',
	'errors.image.couldNotSave': 'Das Foto konnte nicht gespeichert werden.',
	'errors.caption.unreadable': 'Diese Bildunterschrift war nicht zu lesen.',
	'errors.photo.onlyOwnerCaption': 'Nur wer ein Foto hinzugefügt hat, kann es beschriften.',
	'errors.photo.onlyOwnerChange': 'Nur wer ein Foto hinzugefügt hat, kann es ändern.',
	'errors.photo.onlyOwnerRemove': 'Nur wer ein Foto hinzugefügt hat, kann es entfernen.',
	'errors.photo.unreadable': 'Dieses Foto war nicht zu lesen.',
	'errors.photo.notFound': 'Dieses Foto war nicht zu finden.',
	'errors.circle.needName': 'Bitte gib einen Namen für den Kreis ein.',
	'errors.circle.couldNotAdd': 'Der Kreis konnte nicht hinzugefügt werden.',
	'errors.circle.notFound': 'Kreis nicht gefunden',
	'errors.export.adminOnly': 'Nur die Haushalts-Administration kann exportieren.',
	'errors.story.badCursor': 'Fehlerhafter Verlaufs-Cursor',
	'errors.journal.couldNotSave': 'Der Eintrag konnte nicht gespeichert werden.'
};
