/* A person's journal: their days, written down (docs/02 §2.20). */

export const journal = {
	'journal.title': (p: { name: string }) => `${p.name}’s journal · Stella`,
	'journal.heading': 'Journal',
	'journal.intro': (p: { name: string }) => `Moments in ${p.name}’s life, day by day.`,
	'journal.newEntry': 'Write a moment',
	'journal.day': 'Day',
	'journal.titleOptional': 'Title (optional)',
	'journal.titlePlaceholder': 'e.g. First steps',
	'journal.entry': 'Moment',
	'journal.bodyPlaceholder': 'What happened today? (Markdown, @ to mention someone, # for a tag)',
	'journal.addPhotos': 'Add photos',
	'journal.photosReady': (p: { count: number }) =>
		p.count === 1 ? '1 photo ready' : `${p.count} photos ready`,
	'journal.privateOnlyYou': 'Private — only you',
	'journal.saveEntry': 'Save moment',
	'journal.oneEntryPerDay':
		'Moments on the same day are kept together — writing again adds to that day. Private and shared are separate.',
	'journal.by': (p: { author: string }) => `by ${p.author}`,
	'journal.editEntry': 'Edit moment',
	'journal.saveChanges': 'Save changes',
	'journal.editSaveFailed': 'Could not save the changes. Try again.',
	'journal.deleteEntry': 'Delete moment',
	'journal.entryRemoved': 'Moment removed',
	'journal.photoAlt': (p: { name: string; day: string }) => `${p.name}, ${p.day}`,
	'journal.empty.title': 'No moments yet.',
	'journal.empty.hint': (p: { name: string }) =>
		`Capture ${p.name}’s first moment — a milestone, a funny quote, a good day.`,
	'journal.empty.write': 'Write the first moment',
	'journal.uploadFailed': 'Could not save. Try standard JPEG or PNG images.',
	'journal.tags.filter': 'Filter by tag',
	'journal.tags.all': 'All',
	'journal.tags.onlyYou': 'Only you see this tag: it is only on your private moments',
	'journal.tags.filtered': (p: { count: number; name: string }) =>
		p.count === 1 ? `1 moment with #${p.name}` : `${p.count} moments with #${p.name}`,
	'journal.tags.showAll': 'Show all',
	'journal.tags.none': 'No moments with this tag.',
	'journal.tags.noneHint': 'A tag is a #word in a moment’s text.',
	// The tags list and a tag's own page (docs/02 §2.20.2).
	'journal.tags.allTags': 'All tags',
	'journal.tags.listTitle': 'Tags',
	'journal.tags.listIntro': 'What your household files its moments under, most used first.',
	'journal.tags.listHint':
		'Write #word in a moment to tag it. A tag with a lock is on your private moments only.',
	'journal.tags.listEmpty': 'No tags yet',
	'journal.tags.summary': (p: { moments: number; people: number }) =>
		`${p.moments === 1 ? '1 moment' : `${p.moments} moments`} about ${p.people === 1 ? '1 person' : `${p.people} people`}`,
	'journal.tags.unknown': (p: { name: string }) => `No moments with #${p.name}`
};

/** The key set every translation of this area has to provide. */
export type JournalMessages = typeof journal;
