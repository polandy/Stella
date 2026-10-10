/*
 * What the interface says when something cannot be saved. Domain errors carry these as a
 * `Phrase` and the edge renders them in the reader's language (docs/08 §8.3).
 */

export const errors = {
	'errors.contact.birthDateFormat':
		'A birth date must be YYYY-MM-DD, or --MM-DD when the year is unknown.',
	'errors.contact.namePartsInvalid': 'The name parts could not be read. Please try again.',
	'errors.contact.emptyLastName': 'A last name cannot be empty.',
	'errors.contact.lastNameWouldOverwrite': (p: { name: string }) =>
		`${p.name} already has a different last name. Tick them to replace it.`,
	'errors.contact.emptyName': 'A name cannot be empty.',
	'errors.contact.invalidGender': 'Choose female, male or diverse.',
	'errors.contact.jobFieldTooLong': (p: { max: number }) =>
		`Keep the job title and the company to ${p.max} characters each.`,
	'errors.contact.needsSomethingToKnowThemBy':
		'Add a last name or a description, so this person can be told apart from others of the same name later.',
	'errors.contact.emptyDescription': 'Write something to know them by.',
	'errors.contact.needAName': 'Please enter at least a name or nickname.',
	'errors.contact.couldNotCreate': 'Could not add the person.',
	'errors.self.notFound': 'That person is not one you can pick as yourself.',
	'errors.form.checkAndRetry': 'Please check the form and try again.',

	'errors.relationship.toThemselves': 'A person cannot be in a relationship with themselves.',
	'errors.relationship.duplicate': 'That relationship already exists.',
	'errors.relationship.contradiction':
		'These two are already linked the other way round, and that cannot hold in both directions. Remove the existing link first.',
	'errors.relationship.alreadyTied': (p: { tie: string; name: string }) =>
		`That is already on record the other way: ${p.tie} ${p.name}. Correct that link instead of adding a second one.`,
	/** For a refusal that names no link; the wording above is the one a reader should meet. */
	'errors.relationship.alreadyRomantic': (p: { name: string }) =>
		`There is already a partnership on record with ${p.name}. Correct that one instead of adding a second.`,
	'errors.relationship.romanticTaken': (p: { name: string; partner: string }) =>
		`${p.name} is already with ${p.partner}, and that partnership still holds. Mark it as former first.`,
	'errors.relationship.parentsComplete': (p: { name: string; max: number }) =>
		`${p.name} already has ${p.max} parents. Correct one of them instead of adding another.`,
	'errors.relationship.noSuchDay': (p: { day: string }) => `${p.day} is not a day that exists.`,
	'errors.relationship.currentOrFormer': 'A relationship is either current or former.',
	/** One refused person of a batch, by name, before the reason (docs/02 §2.4). */
	'errors.relationship.refusedFor': (p: { name: string; reason: string }) =>
		`${p.name}: ${p.reason}`,

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
	'errors.relationshipType.builtIn':
		'The built-in relationship types cannot be changed or removed.',
	'errors.relationshipType.inUse': (p: { count: number }) =>
		p.count === 1
			? '1 relationship still uses this type. Change it first.'
			: `${p.count} relationships still use this type. Change them first.`,
	'errors.relationshipType.mergeIntoItself': 'A relationship type cannot be merged into itself.',
	'errors.relationshipType.mergeShape':
		'Only types that both read the same from each side, or both read differently, can be merged.',

	'errors.date.unknownKind': (p: { kind: string }) => `Unknown important date kind: ${p.kind}`,
	'errors.date.format': 'A date must be YYYY-MM-DD, or --MM-DD without a year.',
	'errors.date.noSuchDay': (p: { day: string }) =>
		`There is no such day in the calendar: ${p.day}.`,
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
	'errors.command.idTaken': 'This was already sent as something else. Save it again as new.',
	'errors.command.malformed': 'Stella could not read what was sent. Save it again as new.',
	'errors.command.notQueueable': 'Only additions can wait to be sent.',
	'errors.command.photoParentGone': 'What this photo belongs to is no longer there to add it to.',
	'errors.moment.needsPerson':
		'Mention at least one person with @ so the moment has a place to go.',
	'errors.mention.ambiguous': (p: { handle: string; count: number; people: string }) =>
		`@${p.handle} could be ${p.count} people: ${p.people}. Pick the one you mean from the list that opens when you type @.`,

	'errors.image.empty': 'The image is empty.',
	'errors.image.tooLarge': 'The image is too large.',
	'errors.image.thumbEmpty': 'The thumbnail is empty.',
	'errors.image.thumbTooLarge': 'The thumbnail is too large.',
	'errors.image.unsupportedFormat': 'Unsupported image format.',
	'errors.image.formatMismatch': 'Thumbnail format mismatch.',
	'errors.image.takenAt': "The photo's capture date can't be right.",
	'errors.image.cropOutside': 'The chosen square does not fit inside the photo.',
	'errors.image.dimensions': 'Invalid image dimensions.',
	'errors.image.couldNotStore': 'Could not store the photo.',
	'errors.caption.tooLong': (p: { max: number }) => `A caption can be at most ${p.max} characters.`,

	'errors.moment.needText': 'Write what happened first.',
	'errors.moment.badDay': 'Please pick a valid day.',
	'errors.moment.photoFailed': 'The moment was saved, but a photo could not be added.',
	'errors.journal.badDay': 'Please pick a valid date.',
	'errors.circle.needCircleName': 'Please name the circle.',
	'errors.circle.choosePerson': 'Please choose a person.',
	'errors.circle.roleNameBlank': 'Give the role a name — to take roles away, use Select.',
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
	'errors.gift.needTitle': 'A gift needs a name.',
	'errors.gift.badLink': 'The link must be a web address.',
	'errors.gift.needDay': 'Please choose the day.',
	'errors.gift.noSuchDay': (p: { day: string }) => `There is no ${p.day}.`,
	'errors.gift.alreadyGiven': 'This gift was already given.',
	'errors.gift.gone': 'This gift is no longer there.',
	'errors.gift.couldNotSave': 'Could not save the gift.',
	'errors.field.needKindAndValue': 'Please choose a type and enter a value.',
	'errors.field.needValue': 'Write something, or remove it instead.',
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
	'errors.caption.unreadable': 'Could not read that caption.',
	'errors.photo.onlyOwnerCaption': 'Only the person who added a photo can caption it.',
	'errors.photo.onlyOwnerChange': 'Only the person who added a photo can change it.',
	'errors.photo.onlyOwnerRemove': 'Only the person who added a photo can remove it.',
	'errors.photo.unreadable': 'Could not read that photo.',
	'errors.photo.notFound': 'That photo could not be found.',
	'errors.photo.fromImmichGone':
		'This photo is no longer available from Immich. Reload the page and try again.',
	'errors.circle.needName': 'Please enter a circle name.',
	'errors.circle.couldNotAdd': 'Could not add the circle.',
	'errors.circle.notFound': 'Circle not found',
	'errors.circlePhoto.unknownRole': 'Pick one of the circle’s roles, or no role.',
	'errors.admin.only': 'Only an admin can do this.',
	'errors.export.adminOnly': 'Only the household admin can export.',
	'errors.story.badCursor': 'Malformed activity cursor',
	'errors.journal.couldNotSave': 'Could not save the moment.',
	'errors.apiToken.emptyName': 'Please name the token, so you can tell later what it is for.',
	'errors.journal.gone': 'This entry is no longer there.',
	'errors.unexpected': (p: { requestId: string }) =>
		`Something went wrong on our side. If it happens again, mention this reference: ${p.requestId}`
};

/** The key set every translation of this area has to provide. */
export type ErrorsMessages = typeof errors;
