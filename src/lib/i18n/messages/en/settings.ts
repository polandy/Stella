/* The settings landing page, including the language picker (docs/02 §2.17, §2.19). */

export const settings = {
	'settings.title': 'Settings',
	'settings.intro':
		'Account and appearance settings are on their way; the language, the data tools and the relationship vocabulary live here already.',
	'settings.language.heading': 'Language',
	'settings.language.label': 'Interface language',
	'settings.language.hint':
		'Stella speaks English and German. Your choice is kept with your profile, so every device you sign in on follows it.',
	'settings.language.saved': 'Language changed.',
	'settings.language.unsupported': 'Stella does not speak that language.',
	'settings.data.heading': 'Data',
	'settings.data.importPeople': 'Import people',
	'settings.data.importPeopleBlurb':
		'Bring your people, relationships, notes and photos over from a Monica export, or contacts from a vCard.',
	'settings.data.download': 'Download the archive',
	'settings.data.downloadBlurb':
		'Everything the household has, as one readable text file with the photos beside it — yours to keep, and to read with anything.',
	'settings.data.restore': 'Restore from an archive',
	'settings.data.restoreBlurb':
		'Read a Stella archive back in. Anything this household already has is left as it is.',
	'settings.data.relationshipTypes': 'Relationship types',
	'settings.data.relationshipTypesBlurb':
		'Name the kinds of link your household records, beyond the ones Stella ships with.',
	'settings.data.adminOnly': 'Importing, backups and the relationship types are for the household admin.'
};

/** The key set every translation of this area has to provide. */
export type SettingsMessages = typeof settings;
