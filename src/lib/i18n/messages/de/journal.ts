import type { JournalMessages } from '../en/journal';

/** German for `messages/en/journal.ts`. */
export const journal: JournalMessages = {
	'journal.title': (p) => `${p.name}s Tagebuch · Stella`,
	'journal.heading': 'Tagebuch',
	'journal.intro': (p) => `Momente aus ${p.name}s Leben, Tag für Tag.`,
	'journal.newEntry': 'Moment festhalten',
	'journal.day': 'Tag',
	'journal.titleOptional': 'Titel (optional)',
	'journal.titlePlaceholder': 'z. B. Erste Schritte',
	'journal.entry': 'Moment',
	'journal.bodyPlaceholder': 'Was ist heute passiert? (Markdown, @ zum Erwähnen)',
	'journal.addPhotos': 'Fotos hinzufügen',
	'journal.photosReady': (p) => (p.count === 1 ? '1 Foto bereit' : `${p.count} Fotos bereit`),
	'journal.privateOnlyYou': 'Privat — nur du',
	'journal.saveEntry': 'Moment speichern',
	'journal.oneEntryPerDay':
		'Momente am selben Tag bleiben zusammen — schreibst du erneut, wird der Tag ergänzt. Privat und geteilt zählen getrennt.',
	'journal.by': (p) => `von ${p.author}`,
	'journal.editEntry': 'Moment bearbeiten',
	'journal.saveChanges': 'Änderungen speichern',
	'journal.editSaveFailed': 'Die Änderungen konnten nicht gespeichert werden. Versuche es erneut.',
	'journal.deleteEntry': 'Moment löschen',
	'journal.entryRemoved': 'Moment entfernt',
	'journal.photoAlt': (p) => `${p.name}, ${p.day}`,
	'journal.empty.title': 'Noch keine Momente.',
	'journal.empty.hint': (p) =>
		`Halte ${p.name}s ersten Moment fest — einen Meilenstein, einen lustigen Spruch, einen guten Tag.`,
	'journal.empty.write': 'Ersten Moment festhalten',
	'journal.uploadFailed':
		'Konnte nicht gespeichert werden. Versuche es mit üblichen JPEG- oder PNG-Bildern.'
};
