/* The settings landing page, including the language picker (docs/02 §2.17, §2.19). */

export const settings = {
	'settings.title': 'Settings',
	'settings.intro':
		'Appearance settings are on their way; the language, the data tools, the relationship vocabulary and your account live here already.',
	'settings.language.heading': 'Language',
	'settings.language.label': 'Interface language',
	'settings.language.hint':
		'Stella speaks English and German. Your choice is kept with your profile, so every device you sign in on follows it.',
	'settings.language.saved': 'Language changed.',
	'settings.language.unsupported': 'Stella does not speak that language.',
	'settings.self.heading': 'You',
	'settings.self.label': 'Which of these people is you',
	'settings.self.hint':
		'Point Stella at your own record and it knows whose story the map opens on, and which row is you.',
	'settings.self.placeholder': 'Search for yourself by name',
	'settings.self.clear': 'None of them is me',
	'settings.self.saved': 'Saved.',
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
	'settings.data.adminOnly': 'Importing, backups and the relationship types are for the household admin.',
	/*
	 * The household-wide relationship review (docs/02 §2.4.1,
	 * docs/concepts/relationship-suggestions.md §6.6) — for every member, not only the admin:
	 * the dismissal log belongs to the household and any member may answer or take one back.
	 */
	'settings.relationships.heading': 'Relationships',
	'settings.relationships.title': 'Check relationships',
	'settings.relationships.intro':
		'Stella works through everyone you can see and lists the family links that follow from what is already entered. Nothing is stored until you accept it.',
	'settings.relationships.blurb':
		'Go through the whole household at once, rather than a profile at a time.',
	'settings.relationships.idle': 'Nothing checked yet',
	'settings.relationships.idleHint':
		'No rule runs until you ask. On a large household this takes a moment.',
	'settings.relationships.check': 'Check all relationships',
	'settings.relationships.checkAgain': 'Check again',
	'settings.relationships.openCount': (p: { count: number }) =>
		p.count === 1 ? '1 suggestion open' : `${p.count} suggestions open`,
	'settings.relationships.nothing':
		'Nothing open. Stella finds nothing across your household that is not on record already.',
	/*
	 * The folds (docs/concepts/relationship-review-at-scale.html). Each one names the number it
	 * is holding back — "22 more for Bettina Meier", not "show more" — because a number the
	 * reader can check is the difference between folding a list and quietly truncating it.
	 */
	'settings.relationships.openAcross': (p: { claims: number; people: number }) =>
		`${p.claims} open across ${p.people === 1 ? '1 person' : `${p.people} people`}`,
	'settings.relationships.peopleRange': (p: { from: number; to: number; total: number }) =>
		`People ${p.from}–${p.to} of ${p.total}`,
	'settings.relationships.answerRange': (p: { from: number; to: number; total: number }) =>
		`Answers ${p.from}–${p.to} of ${p.total}`,
	'settings.relationships.nextPeople': (p: { count: number }) => `Next ${p.count} people`,
	'settings.relationships.previousPeople': (p: { count: number }) => `Previous ${p.count} people`,
	'settings.relationships.nextPage': 'Next',
	'settings.relationships.previousPage': 'Previous',
	'settings.relationships.moreForPerson': (p: { count: number; name: string }) =>
		`${p.count} more for ${p.name}`,
	'settings.relationships.openAll': (p: { count: number }) => `Open all ${p.count}`,
	'settings.relationships.findPerson': 'Find a person',
	'settings.relationships.searchSubmit': 'Search',
	'settings.relationships.clearSearch': 'Clear',
	'settings.relationships.noMatch': (p: { query: string }) =>
		`Nobody called “${p.query}” has anything open.`,
	'settings.relationships.declinedLog': (p: { count: number }) =>
		p.count === 1 ? '1 declined suggestion' : `${p.count} declined suggestions`,
	'settings.relationships.declinedHeading': 'Declined suggestions',
	'settings.relationships.declinedBlurb':
		'What somebody in this household said no to. Offering one again puts it back in the list.',
	'settings.relationships.backToList': 'Back to the list',
	'settings.account.heading': 'Account',
	'settings.about.heading': 'About',
	'settings.about.version': (p: { version: string }) => `Stella ${p.version}`,
	'settings.about.checking': 'Looking for a newer release…',
	'settings.about.badge': 'New',
	'settings.about.available': (p: { version: string }) => `${p.version} is available`,
	'settings.about.releaseNotes': 'Release notes',
	'settings.about.current': 'This is the newest release.',
	'settings.about.unreachable': 'GitHub could not be reached, so this may not be the newest release.',
	'settings.about.unreachableSince': (p: { when: string }) => `Last checked ${p.when}.`,
	'settings.about.off':
		'Stella is not checking for new releases. Set UPDATE_CHECK=true to switch it on.'
};

/** The key set every translation of this area has to provide. */
export type SettingsMessages = typeof settings;
