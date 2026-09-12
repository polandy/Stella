/* Copy that belongs to the design-system components themselves (docs/05). */

export const components = {
	'components.saved': 'Saved',
	'components.photo.add': 'Add a photo',
	'components.photo.change': 'Change photo',
	'components.photo.addShort': 'Add',
	'components.photo.changeShort': 'Change',
	'components.photo.failed': 'Could not upload the photo. Try a JPEG or PNG image.',
	'components.palette.jumpTo': 'Jump to',
	'components.palette.placeholder': 'Jump to a person, or do something…',
	'components.palette.empty': 'Nobody by that name.',
	'components.palette.write': 'Write a moment',
	'components.palette.addPerson': 'Add person',
	'components.palette.searchEverything': (p: { query: string }) =>
		`Search everything for “${p.query}”`,
	'components.palette.kindSearch': 'search',
	'components.palette.kindAction': 'action',
	'components.personSearch.placeholder': 'Search people…',
	'components.personSearch.empty': 'No one found.',
	'components.personSearch.remove': (p: { name: string }) => `Remove ${p.name}`,
	'components.dateField.day': 'Day',
	'components.dateField.month': 'Month',
	'components.dateField.year': 'Year',
	'components.dateField.dayPlaceholder': 'DD',
	'components.dateField.yearPlaceholder': 'YYYY',
	'components.dateField.monthEmpty': 'Month…',
	'components.dateField.yearOptional': 'Leave the year blank if you do not know it.',
	'components.dateField.noSuchDay': 'There is no such day in the calendar.',
	'components.dateField.incomplete': 'Fill in the whole date, or clear it.',
	'components.dateField.inFuture': 'That day has not happened yet.'
};

/** The key set every translation of this area has to provide. */
export type ComponentsMessages = typeof components;
