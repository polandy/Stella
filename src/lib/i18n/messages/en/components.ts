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
	'components.palette.kindAction': 'action'
};

/** The key set every translation of this area has to provide. */
export type ComponentsMessages = typeof components;
