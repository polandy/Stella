/*
 * Copy that belongs to no single screen: the words on buttons, the shape of a list, the
 * things the interface says while it waits. English is the source of truth for the keys —
 * `messages/de/common.ts` is typed against this module and cannot drift from it.
 */

export const common = {
	'common.save': 'Save',
	'common.saving': 'Saving…',
	'common.cancel': 'Cancel',
	'common.delete': 'Delete',
	'common.remove': 'Remove',
	'common.edit': 'Edit',
	'common.add': 'Add',
	'common.close': 'Close',
	'common.back': 'Back',
	'common.open': 'Open',
	'common.search': 'Search',
	'common.searchPlaceholder': 'Search…',
	'common.loading': 'Loading…',
	'common.undo': 'Undo',
	'common.undone': 'Undone',
	'common.more': 'More',
	'common.none': 'None',
	'common.optional': 'optional',
	'common.today': 'today',
	'common.yesterday': 'yesterday',
	'common.tomorrow': 'tomorrow',
	'common.shared': 'Shared',
	'common.private': 'Private',
	'common.sharedHint': 'The whole household can see this.',
	'common.privateHint': 'Only you can see this.',
	'common.somethingWentWrong': 'Something went wrong. Please try again.'
};

/** The key set every translation of this area has to provide. */
export type CommonMessages = typeof common;
