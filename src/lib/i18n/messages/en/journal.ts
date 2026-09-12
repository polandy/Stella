/* A person's journal: their days, written down (docs/02 §2.20). */

export const journal = {
	'journal.title': (p: { name: string }) => `${p.name}’s journal · Stella`,
	'journal.heading': 'Journal',
	'journal.intro': (p: { name: string }) => `Moments in ${p.name}’s life, day by day.`,
	'journal.newEntry': 'New entry',
	'journal.day': 'Day',
	'journal.titleOptional': 'Title (optional)',
	'journal.titlePlaceholder': 'e.g. First steps',
	'journal.entry': 'Entry',
	'journal.bodyPlaceholder': 'What happened today? (Markdown, @ to mention someone)',
	'journal.addPhotos': 'Add photos',
	'journal.photosReady': (p: { count: number }) =>
		p.count === 1 ? '1 photo ready' : `${p.count} photos ready`,
	'journal.privateOnlyYou': 'Private — only you',
	'journal.saveEntry': 'Save entry',
	'journal.oneEntryPerDay':
		'One entry per day — saving the same day again updates it. Private and shared are separate.',
	'journal.by': (p: { author: string }) => `by ${p.author}`,
	'journal.editEntry': 'Edit entry',
	'journal.saveChanges': 'Save changes',
	'journal.editSaveFailed': 'Could not save the changes. Try again.',
	'journal.deleteEntry': 'Delete entry',
	'journal.entryRemoved': 'Entry removed',
	'journal.photoAlt': (p: { name: string; day: string }) => `${p.name}, ${p.day}`,
	'journal.empty.title': 'No journal entries yet.',
	'journal.empty.hint': (p: { name: string }) =>
		`Capture ${p.name}’s first moment — a milestone, a funny quote, a good day.`,
	'journal.uploadFailed': 'Could not save. Try standard JPEG or PNG images.'
};

/** The key set every translation of this area has to provide. */
export type JournalMessages = typeof journal;
