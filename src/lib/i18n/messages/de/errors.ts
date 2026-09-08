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

	'errors.journal.couldNotSave': 'Der Eintrag konnte nicht gespeichert werden.'
};
