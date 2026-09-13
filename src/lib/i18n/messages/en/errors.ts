/*
 * What the interface says when something cannot be saved. Domain errors carry these as a
 * `Phrase` and the edge renders them in the reader's language (docs/08 §8.3).
 */

export const errors = {
	'errors.contact.birthDateFormat':
		'A birth date must be YYYY-MM-DD, or --MM-DD when the year is unknown.',
	'errors.contact.emptyName': 'A name cannot be empty.',
	'errors.contact.needAName': 'Please enter at least a name or nickname.',
	'errors.contact.couldNotCreate': 'Could not add the person.',
	'errors.self.notFound': 'That person is not one you can pick as yourself.',
	'errors.form.checkAndRetry': 'Please check the form and try again.',

	'errors.relationship.duplicate': 'That relationship already exists.',
	'errors.relationship.noSuchDay': (p: { day: string }) => `${p.day} is not a day that exists.`,
	'errors.relationship.currentOrFormer': 'A relationship is either current or former.',

	'errors.relationshipType.needsLabel': 'A relationship type needs a label.',
	'errors.relationshipType.needsBothLabels':
		'A type that reads differently from each side needs both labels.',
	'errors.relationshipType.labelTooLong': (p: { max: number }) =>
		`A label is at most ${p.max} characters.`,
	'errors.relationshipType.unknownCategory': (p: { category: string }) =>
		`${p.category} is not a relationship category.`,
	'errors.relationshipType.unnameable': (p: { label: string }) =>
		`"${p.label}" has no letters or digits to name it by.`,
	'errors.relationshipType.taken': (p: { label: string }) =>
		`A relationship type named like "${p.label}" already exists.`,
	'errors.relationshipType.builtIn': 'The built-in relationship types cannot be changed or removed.',
	'errors.relationshipType.inUse': (p: { count: number }) =>
		p.count === 1
			? '1 relationship still uses this type. Change it first.'
			: `${p.count} relationships still use this type. Change them first.`,

	'errors.date.unknownKind': (p: { kind: string }) => `Unknown important date kind: ${p.kind}`,
	'errors.date.format': 'A date must be YYYY-MM-DD, or --MM-DD without a year.',
	'errors.date.noSuchDay': (p: { day: string }) => `There is no such day in the calendar: ${p.day}.`,
	'errors.date.needsLabel': 'Give the date a name so it means something later.',
	'errors.date.couldNotAdd': 'Could not add the date.',

	'errors.interaction.unknownKind': (p: { kind: string }) => `Unknown interaction kind: ${p.kind}`,
	'errors.interaction.dayFormat': 'The day must be YYYY-MM-DD.',
	'errors.interaction.noSuchDay': (p: { day: string }) =>
		`There is no such day in the calendar: ${p.day}.`,
	'errors.interaction.selfParticipant':
		'The person the interaction is about cannot also be a participant.',
	'errors.interaction.couldNotLog': 'Could not log the interaction.',

	'errors.moment.couldNotSave': 'Could not save the moment.',
	'errors.moment.needsPerson': 'Mention at least one person with @ so the moment has a place to go.',

	'errors.image.empty': 'The image is empty.',
	'errors.image.tooLarge': 'The image is too large.',
	'errors.image.thumbEmpty': 'The thumbnail is empty.',
	'errors.image.thumbTooLarge': 'The thumbnail is too large.',
	'errors.image.unsupportedFormat': 'Unsupported image format.',
	'errors.image.formatMismatch': 'Thumbnail format mismatch.',
	'errors.image.dimensions': 'Invalid image dimensions.',
	'errors.image.couldNotStore': 'Could not store the photo.',
	'errors.caption.tooLong': (p: { max: number }) => `A caption can be at most ${p.max} characters.`,

	'errors.moment.needText': 'Write what happened first.',
	'errors.moment.badDay': 'Please pick a valid day.',
	'errors.moment.photoFailed': 'The moment was saved, but a photo could not be added.',
	'errors.journal.badDay': 'Please pick a valid date.',
	'errors.journal.photoFailed': 'The entry was saved, but a photo could not be added.',
	'errors.circle.needCircleName': 'Please name the circle.',
	'errors.circle.choosePerson': 'Please choose a person.',
	'errors.relationshipType.gone': 'That relationship type is gone.',
	'errors.notFound': 'Not found',
	'errors.notSignedIn': 'Not signed in',
	'errors.person.notFound': 'That person could not be found.',
	'errors.contact.notFound': 'Contact not found',
	'errors.merge.choose': 'Choose who to merge in.',
	'errors.merge.failed': 'That person could not be merged in.',
	'errors.relationship.needPersonAndType': 'Please choose a person and a relationship type.',
	'errors.relationship.couldNotAdd': 'Could not add the relationship.',
	'errors.relationship.couldNotSave': 'Could not save the relationship.',
	'errors.relationship.notFound': 'That relationship could not be found.',
	'errors.relationship.badSuggestion': 'That suggestion could not be read.',
	'errors.note.empty': 'Please write something before saving.',
	'errors.note.couldNotSave': 'Could not save the note.',
	'errors.field.needKindAndValue': 'Please choose a type and enter a value.',
	'errors.field.couldNotAdd': 'Could not add the field.',
	'errors.date.needKindAndDay': 'Please choose a kind and a day.',
	'errors.interaction.needKindAndDay': 'Please choose what happened and on which day.',
	'errors.interaction.participantNotFound': 'One of the participants could not be found.',
	'errors.interaction.onlyLogger': 'Only the person who logged it can remove it.',
	'errors.journal.onlyAuthor': 'Only the person who wrote it can remove it.',
	'errors.tag.needName': 'Please enter a tag name.',
	'errors.tag.couldNotAdd': 'Could not add the tag.',
	'errors.image.chooseSome': 'Please choose at least one image.',
	'errors.image.chooseOne': 'Please choose an image.',
	'errors.image.couldNotSave': 'Could not save the photo.',
	'errors.caption.unreadable': 'Could not read that caption.',
	'errors.photo.onlyOwnerCaption': 'Only the person who added a photo can caption it.',
	'errors.photo.onlyOwnerChange': 'Only the person who added a photo can change it.',
	'errors.photo.onlyOwnerRemove': 'Only the person who added a photo can remove it.',
	'errors.photo.unreadable': 'Could not read that photo.',
	'errors.photo.notFound': 'That photo could not be found.',
	'errors.circle.needName': 'Please enter a circle name.',
	'errors.circle.couldNotAdd': 'Could not add the circle.',
	'errors.circle.notFound': 'Circle not found',
	'errors.export.adminOnly': 'Only the household admin can export.',
	'errors.story.badCursor': 'Malformed story cursor',
	'errors.journal.couldNotSave': 'Could not save the entry.',
	'errors.journal.editFailed': 'Could not save the changes.'
};

/** The key set every translation of this area has to provide. */
export type ErrorsMessages = typeof errors;
