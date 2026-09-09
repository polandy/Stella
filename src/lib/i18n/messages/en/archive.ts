/* The archive: what a restore brings back, and what it could not (docs/02 §2.15). */

export const archive = {
	'archive.restore.title': 'Restore from an archive',
	'archive.restore.intro':
		'Read a Stella archive back in: the people, everything written about them, and the photos beside it. Records this household already has are left exactly as they are, so restoring the same archive twice changes nothing.',
	'archive.restore.fileLabel': 'Archive file (.tar)',
	'archive.restore.fileHint':
		'The file Settings → Download the archive gives you, or a folder you unpacked and packed again with tar.',
	'archive.restore.submit': 'Restore',
	'archive.restore.from': (p: { household: string }) => `Restored from ${p.household}`,
	'archive.restore.exportedOn': (p: { day: string }) => `, exported ${p.day}`,
	'archive.restore.added': (p: { count: number }) => `${p.count} added`,
	'archive.restore.alreadyHere': (p: { count: number }) => `${p.count} already here`,
	'archive.restore.nothingNew': 'This archive held nothing that is not already here.',
	'archive.restore.photos': (p: { stored: string; already: number; missing: number }) =>
		`Photos: ${p.stored} stored` +
		(p.already > 0 ? `, ${p.already} already on disk` : '') +
		(p.missing > 0 ? `, ${p.missing} missing from the archive` : '') +
		'.',
	'archive.restore.backToSettings': 'Back to settings',
	'archive.restore.seePeople': 'See the people',
	'archive.restore.chooseFile': 'Please choose the .tar archive to restore.',
	'archive.restore.tooLarge': (p: { megabytes: number }) =>
		`That archive is larger than the ${p.megabytes} MB this importer accepts.`,

	'archive.count': (p: { count: number; what: string }) => `${p.count} ${p.what}`,
	'archive.table.contact': (p: { count: number }): string => (p.count === 1 ? 'person' : 'people'),
	'archive.table.relationship': (p: { count: number }): string =>
		p.count === 1 ? 'relationship' : 'relationships',
	'archive.table.relationship_type': (p: { count: number }): string =>
		p.count === 1 ? 'relationship type' : 'relationship types',
	'archive.table.contact_field': (p: { count: number }): string =>
		p.count === 1 ? 'contact detail' : 'contact details',
	'archive.table.important_date': (p: { count: number }): string =>
		p.count === 1 ? 'important date' : 'important dates',
	'archive.table.note': (p: { count: number }): string => (p.count === 1 ? 'note' : 'notes'),
	'archive.table.note_mention': (p: { count: number }): string =>
		p.count === 1 ? 'note mention' : 'note mentions',
	'archive.table.journal_entry': (p: { count: number }): string =>
		p.count === 1 ? 'journal entry' : 'journal entries',
	'archive.table.journal_mention': (p: { count: number }): string =>
		p.count === 1 ? 'journal mention' : 'journal mentions',
	'archive.table.interaction': (p: { count: number }): string =>
		p.count === 1 ? 'touchpoint' : 'touchpoints',
	'archive.table.interaction_participant': (p: { count: number }): string =>
		p.count === 1 ? 'participant' : 'participants',
	'archive.table.photo': (p: { count: number }): string => (p.count === 1 ? 'photo' : 'photos'),
	'archive.table.tag': (p: { count: number }): string => (p.count === 1 ? 'tag' : 'tags'),
	'archive.table.contact_tag': (p: { count: number }): string =>
		p.count === 1 ? 'tagged person' : 'tagged people',
	'archive.table.circle': (p: { count: number }): string => (p.count === 1 ? 'circle' : 'circles'),
	'archive.table.circle_membership': (p: { count: number }): string =>
		p.count === 1 ? 'circle member' : 'circle members',
	'archive.table.activity_log': (p: { count: number }): string =>
		p.count === 1 ? 'log entry' : 'log entries',

	'archive.mention.noteMentions': 'note mentions',
	'archive.mention.journalMentions': 'journal mentions',
	'archive.mention.touchpointParticipants': 'touchpoint participants',

	'archive.warning.personWithoutName': 'A person without an id or a name was left out.',
	'archive.warning.photoWithoutFile': 'A photo without a file was left out.',
	'archive.warning.photoBadPath': (p: { file: string }) =>
		`A photo naming an unusable file path (“${p.file}”) was left out.`,
	'archive.warning.pointedAtMissingPeople': (p: { what: string }) =>
		`Some ${p.what} pointed at people the archive does not contain and were left out.`,
	'archive.warning.contactFieldIncomplete': 'A contact detail without a kind or a value was left out.',
	'archive.warning.importantDateIncomplete': 'An important date without a day or a kind was left out.',
	'archive.warning.noteWithoutText': 'A note with no text was left out.',
	'archive.warning.journalEntryIncomplete': 'A journal entry without a day or any text was left out.',
	'archive.warning.touchpointIncomplete': 'A touchpoint without a kind or a date was left out.',
	'archive.warning.tagWithoutName': 'A tag without a name was left out.',
	'archive.warning.tagsNotInList':
		'Some tags on people are not in the archive’s tag list and were left out.',
	'archive.warning.circleWithoutName': 'A circle without a name was left out.',
	'archive.warning.circleMissingParent': (p: { name: string }) =>
		`“${p.name}” sat inside a circle the archive does not contain; it is restored on its own.`,
	'archive.warning.circleMemberMissing': (p: { name: string }) =>
		`A member of “${p.name}” is not in the archive and was left out.`,
	'archive.warning.relationshipTypeWithoutName': 'A relationship type without a name was left out.',
	'archive.warning.relationshipMissingEnd': 'A relationship missing one of its ends was left out.',
	'archive.warning.relationshipsMissingPeople':
		'Some relationships joined people the archive does not contain and were left out.',
	'archive.warning.relationshipUnknownType':
		'Some relationships were of a kind this Stella does not know and were left out. Add the relationship type, then import again.',

	'archive.warning.imagesMissing': (p: { count: number }) =>
		p.count === 1
			? '1 image named in the document was not in the archive; that photo will show as missing.'
			: `${p.count} images named in the document were not in the archive; those photos will show as missing.`,
	'archive.error.unusableFileName': (p: { name: string }) =>
		`This archive contains an unusable file name: “${p.name}”.`,
	'archive.error.noDocument': (p: { document: string }) =>
		`This archive has no ${p.document} in it, so it is not a Stella archive.`,
	'archive.restoredSummary': (p: { people: string; household: string }) =>
		`restored ${p.people} from an archive of ${p.household}`,
	'archive.peopleCount': (p: { count: number }): string =>
		p.count === 1 ? '1 person' : `${p.count} people`,

	'archive.error.notAnArchive': 'This file does not contain a Stella archive.',
	'archive.error.noFormatLine':
		'This file is not a Stella archive — it has no “format: stella-archive” line.',
	'archive.error.noVersion': 'This archive does not say which format version it is.',
	'archive.error.newerVersion': (p: { fileVersion: number; reads: number }) =>
		`This archive was written by a newer version of Stella (format ${p.fileVersion}, this one reads ${p.reads}). Update Stella first.`,
	'archive.error.foreignHousehold': (p: { table: string; id: string }) =>
		`This archive has already been restored into another household on this server (${p.table} “${p.id}”), so it cannot be restored here.`,
	'archive.error.badHeaderField': 'The archive has a header field that is not a number.',
	'archive.error.notATar': 'This file is not an archive.',
	'archive.error.damaged': 'This file is not a Stella archive, or it was damaged in transit.',
	'archive.error.truncated': (p: { name: string }) =>
		`The archive ends in the middle of "${p.name}".`,
	'archive.error.unsupportedEntry': (p: { name: string; typeflag: string | number }) =>
		`"${p.name}" is a kind of archive entry (type ${p.typeflag}) this reader does not accept.`
};

/** The key set every translation of this area has to provide. */
export type ArchiveMessages = typeof archive;
