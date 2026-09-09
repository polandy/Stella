/*
 * Bringing another address book in (docs/02 §2.16): the wizard, what the plan leaves out,
 * and the words the importer writes into the notes it creates.
 *
 * The plan itself stays language-free — it reports codes — so these are read twice: once by
 * the wizard, and once by the route that hands the plan its wording.
 */

export const importer = {
	'import.title': 'Import people',
	'import.intro':
		'An export of your Monica becomes people, relationships, notes, interactions, tags and photos here; a vCard brings the people alone. Stella works out which of the three you uploaded. Nothing is written until you confirm.',
	'import.steps': 'Steps',
	'import.step.upload': 'upload',
	'import.step.preview': 'preview',
	'import.step.photos': 'Import & photos',
	'import.fileLabel':
		'Monica export — JSON (.json) or database dump (.sql) — or a vCard (.vcf), plain or gzipped',
	'import.fileHint.monica': 'In Monica: Settings → Export data gives you the JSON file, pictures included. A vCard comes from any address book — phone, mail client, Google Contacts — and carries the people only. For a dump instead, on a self-hosted Monica:',
	'import.visibilityLegend': 'Everything imported is',
	'import.visibility.shared': 'Shared with the household',
	'import.visibility.private': 'Private to me',
	'import.preview': 'Preview',
	'import.whatWillBeImported': 'What will be imported',
	'import.newTypes': 'New relationship types, because Stella has no built-in equivalent:',
	'import.leftOut': 'Left out, and why',
	'import.startOver': 'Start over',
	'import.importNow': 'Import now',
	'import.done': (p: {
		contacts: number;
		relationships: number;
		notes: number;
		interactions: number;
		tags: number;
	}) =>
		`Imported ${p.contacts} people, ${p.relationships} relationships, ${p.notes} notes, ${p.interactions} interactions and ${p.tags} tags.`,
	'import.nothingTwice': 'Everything was already there, so nothing was written twice.',
	'import.photos': (p: { count: number }) => `Photos (${p.count})`,
	'import.photos.embedded':
		'Your export carries the pictures inside it, so there is no folder to point at. Each one is resized in your browser as it arrives; you can close this page once it says done.',
	'import.photos.folder':
		'Point the picker at Monica’s photo folder (storage/app/public/photos). Each file is resized in your browser and uploaded; you can close this page once it says done.',
	'import.photos.folderLabel': 'Monica photo folder',
	'import.photos.store': 'Store photos',
	'import.photos.storing': 'Storing…',
	'import.progress': (p: {
		done: number;
		total: number;
		stored: number;
		already: number;
		missing: number;
		failed: number;
	}) =>
		`${p.done} of ${p.total} · ${p.stored} stored` +
		(p.already ? `, ${p.already} already there` : '') +
		(p.missing ? `, ${p.missing} not in the folder` : '') +
		(p.failed ? `, ${p.failed} failed` : ''),
	'import.finish': 'Finish',

	'import.count.contacts': 'contacts',
	'import.count.contactFields': 'contact fields',
	'import.count.relationships': 'relationships',
	'import.count.relationshipTypes': 'relationship types',
	'import.count.notes': 'notes',
	'import.count.interactions': 'interactions',
	'import.count.tags': 'tags',
	'import.count.photos': 'photos',

	'import.thing.contact': (p: { count: number }): string => (p.count === 1 ? 'contact' : 'contacts'),
	'import.thing.relationship': (p: { count: number }): string =>
		p.count === 1 ? 'relationship' : 'relationships',
	'import.thing.contactField': (p: { count: number }): string =>
		p.count === 1 ? 'contact field' : 'contact fields',
	'import.thing.address': (p: { count: number }): string => (p.count === 1 ? 'address' : 'addresses'),
	'import.thing.note': (p: { count: number }): string => (p.count === 1 ? 'note' : 'notes'),
	'import.thing.gift': (p: { count: number }): string => (p.count === 1 ? 'gift' : 'gifts'),
	'import.thing.lifeEvent': (p: { count: number }): string => (p.count === 1 ? 'life event' : 'life events'),
	'import.thing.pet': (p: { count: number }): string => (p.count === 1 ? 'pet' : 'pets'),
	'import.thing.activity': (p: { count: number }): string => (p.count === 1 ? 'activity' : 'activities'),
	'import.thing.photo': (p: { count: number }): string => (p.count === 1 ? 'photo' : 'photos'),
	'import.thing.journalEntry': (p: { count: number }): string =>
		p.count === 1 ? 'journal entry' : 'journal entries',
	'import.thing.reminder': (p: { count: number }): string => (p.count === 1 ? 'reminder' : 'reminders'),

	'import.why.deletedInMonica': 'deleted in Monica',
	'import.why.refersToDeletedContact': 'refers to a deleted contact',
	'import.why.belongsToDeletedContact': 'belongs to a deleted contact',
	'import.why.empty': 'empty',
	'import.why.linkedToNoPerson': 'linked to no person',
	'import.why.linkedOnlyToDeletedContacts': 'linked only to deleted contacts',
	'import.why.attachedToNoPerson': 'attached to no person',
	'import.why.notAttachedToPerson': 'not attached to a person',
	'import.why.remindersDerived': 'Stella derives birthday reminders itself',

	'import.warning.customType': (p: { name: string }) =>
		`Relationship type "${p.name}" has no Stella equivalent; created as a custom type.`,
	'import.warning.manyUsers': (p: { count: number }) =>
		`Monica had ${p.count} user accounts; everything is attributed to the importing member.`,
	'import.warning.vcardPeopleOnly':
		'A vCard carries people only — no relationships, interactions or journal entries are read from it.',
	'import.warning.jsonNoHowWeMet':
		'Monica’s JSON export does not carry “how you met” or where; that free text is not in the file.',

	'import.note.gift': 'Gift',
	'import.note.lifeEvent': 'Life event',
	'import.note.pet': 'Pet',
	'import.note.monicaActivity': (p: { kind: string }) => `(Monica activity: ${p.kind})`,
	'import.metThrough': (p: { name: string }) => `Through ${p.name}`,
	'import.metThroughInfo': (p: { info: string; name: string }) => `${p.info} (through ${p.name})`,

	'import.error.chooseFile': 'Please choose the Monica export or vCard file to import.',
	'import.error.sessionMissing': 'The import session is missing. Please upload the dump again.',
	'import.error.sessionGone': 'The uploaded dump is no longer available. Please upload it again.',
	'import.error.sessionOver': 'The import session is over; start again from the export.',
	'import.error.tooLarge': 'The file is larger than this importer accepts.',
	'import.error.notJson': 'This file starts like JSON but could not be read as JSON.',
	'import.error.notMonicaJson': 'This file is not a Monica JSON export.',
	'import.error.jsonNoUuid': (p: { what: string }) => `A ${p.what} in this export has no uuid.`,
	'import.error.jsonUnsupported': (p: { detail: string }) => p.detail,
	'import.error.vcardOverlap': 'A card in this file begins before the one before it ended.',
	'import.error.vcardEndWithoutBegin': 'This file ends a card that never began.',
	'import.error.vcardUnclosed': 'A card in this file was never closed with END:VCARD.',
	'import.error.notVcard': 'This file is not a vCard — it contains no BEGIN:VCARD.',
	'import.error.vcardNameless': (p: { index: number }) =>
		`A card in this file names nobody — it has neither FN nor N (card ${p.index}).`,
	'import.error.dumpMalformedInsert': (p: { table: string; what: string }) =>
		`Malformed INSERT for table ${p.table}: ${p.what}.`,
	'import.error.notSqlDump': 'This does not look like a MariaDB/MySQL dump: no CREATE TABLE found.',
	'import.error.insertWithoutCreate': (p: { table: string }) =>
		`INSERT into ${p.table} without a CREATE TABLE for it.`,
	'import.error.columnCountMismatch': (p: { detail: string }) => p.detail,
	'import.error.noSuchTable': (p: { name: string }) => `The dump has no table named ${p.name}.`,
	'import.error.noSuchColumn': (p: { table: string; column: string }) =>
		`Table ${p.table} has no column ${p.column}.`,
	'import.error.notMonicaDump': (p: { table: string }) =>
		`This dump has no ${p.table} table — is it really a Monica database?`,
	'import.error.photoNotInImport': 'This photo is not part of the import.',
	'import.error.pictureNotCarried':
		'This export does not carry the picture; point at Monica’s photo folder.',
	'import.error.missingPhotoFields': 'Missing photo upload fields.',
	'import.error.missingToken': 'Missing token or photo id.'
};

/** The key set every translation of this area has to provide. */
export type ImportMessages = typeof importer;
