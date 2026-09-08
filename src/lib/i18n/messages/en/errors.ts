/*
 * What the interface says when something cannot be saved. Domain errors carry these as a
 * `Phrase` and the edge renders them in the reader's language (docs/08 §8.3).
 */

export const errors = {
	'errors.contact.birthDateFormat':
		'A birth date must be YYYY-MM-DD, or --MM-DD when the year is unknown.',
	'errors.contact.emptyName': 'A name cannot be empty.',
	'errors.contact.needAName': 'Please enter at least a name or nickname.',
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

	'errors.journal.couldNotSave': 'Could not save the entry.'
};

/** The key set every translation of this area has to provide. */
export type ErrorsMessages = typeof errors;
