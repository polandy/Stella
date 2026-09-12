import type { JournalMessages } from '../en/journal';

/** German for `messages/en/journal.ts`. */
export const journal: JournalMessages = {
	'journal.title': (p) => `${p.name}s Tagebuch · Stella`,
	'journal.heading': 'Tagebuch',
	'journal.intro': (p) => `Momente aus ${p.name}s Leben, Tag für Tag.`,
	'journal.newEntry': 'Neuer Eintrag',
	'journal.day': 'Tag',
	'journal.titleOptional': 'Titel (optional)',
	'journal.titlePlaceholder': 'z. B. Erste Schritte',
	'journal.entry': 'Eintrag',
	'journal.bodyPlaceholder': 'Was ist heute passiert? (Markdown, @ zum Erwähnen)',
	'journal.addPhotos': 'Fotos hinzufügen',
	'journal.photosReady': (p) => (p.count === 1 ? '1 Foto bereit' : `${p.count} Fotos bereit`),
	'journal.privateOnlyYou': 'Privat — nur du',
	'journal.saveEntry': 'Eintrag speichern',
	'journal.oneEntryPerDay':
		'Ein Eintrag pro Tag — speicherst du denselben Tag erneut, wird er aktualisiert. Privat und geteilt zählen getrennt.',
	'journal.by': (p) => `von ${p.author}`,
	'journal.editEntry': 'Eintrag bearbeiten',
	'journal.saveChanges': 'Änderungen speichern',
	'journal.editSaveFailed': 'Die Änderungen konnten nicht gespeichert werden. Versuche es erneut.',
	'journal.deleteEntry': 'Eintrag löschen',
	'journal.entryRemoved': 'Eintrag entfernt',
	'journal.photoAlt': (p) => `${p.name}, ${p.day}`,
	'journal.empty.title': 'Noch keine Tagebucheinträge.',
	'journal.empty.hint': (p) =>
		`Halte ${p.name}s ersten Moment fest — einen Meilenstein, einen lustigen Spruch, einen guten Tag.`,
	'journal.uploadFailed':
		'Konnte nicht gespeichert werden. Versuche es mit üblichen JPEG- oder PNG-Bildern.'
};
