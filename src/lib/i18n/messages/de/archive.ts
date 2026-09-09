import type { ArchiveMessages } from '../en/archive';

/** German for `messages/en/archive.ts`. */
export const archive: ArchiveMessages = {
	'archive.restore.title': 'Aus einem Archiv wiederherstellen',
	'archive.restore.intro':
		'Ein Stella-Archiv wieder einlesen: die Menschen, alles über sie Geschriebene und die Fotos daneben. Was dieser Haushalt schon hat, bleibt genau so, wie es ist — dasselbe Archiv zweimal einzulesen ändert also nichts.',
	'archive.restore.fileLabel': 'Archivdatei (.tar)',
	'archive.restore.fileHint':
		'Die Datei, die dir Einstellungen → Archiv herunterladen gibt — oder ein Ordner, den du entpackt und mit tar wieder gepackt hast.',
	'archive.restore.submit': 'Wiederherstellen',
	'archive.restore.from': (p) => `Wiederhergestellt aus ${p.household}`,
	'archive.restore.exportedOn': (p) => `, exportiert am ${p.day}`,
	'archive.restore.added': (p) => `${p.count} hinzugefügt`,
	'archive.restore.alreadyHere': (p) => `${p.count} schon vorhanden`,
	'archive.restore.nothingNew': 'Dieses Archiv enthielt nichts, was nicht schon da wäre.',
	'archive.restore.photos': (p) =>
		`Fotos: ${p.stored} gespeichert` +
		(p.already > 0 ? `, ${p.already} schon auf der Platte` : '') +
		(p.missing > 0 ? `, ${p.missing} fehlen im Archiv` : '') +
		'.',
	'archive.restore.backToSettings': 'Zurück zu den Einstellungen',
	'archive.restore.seePeople': 'Die Menschen ansehen',
	'archive.restore.chooseFile': 'Bitte wähle das .tar-Archiv zum Wiederherstellen.',
	'archive.restore.tooLarge': (p) =>
		`Dieses Archiv ist größer als die ${p.megabytes} MB, die dieser Import annimmt.`,

	'archive.count': (p) => `${p.count} ${p.what}`,
	'archive.table.contact': (p) => (p.count === 1 ? 'Person' : 'Menschen'),
	'archive.table.relationship': (p) => (p.count === 1 ? 'Beziehung' : 'Beziehungen'),
	'archive.table.relationship_type': (p) => (p.count === 1 ? 'Beziehungsart' : 'Beziehungsarten'),
	'archive.table.contact_field': (p) => (p.count === 1 ? 'Kontaktangabe' : 'Kontaktangaben'),
	'archive.table.important_date': (p) => (p.count === 1 ? 'wichtiges Datum' : 'wichtige Daten'),
	'archive.table.note': (p) => (p.count === 1 ? 'Notiz' : 'Notizen'),
	'archive.table.note_mention': (p) => (p.count === 1 ? 'Notiz-Erwähnung' : 'Notiz-Erwähnungen'),
	'archive.table.journal_entry': (p) => (p.count === 1 ? 'Tagebucheintrag' : 'Tagebucheinträge'),
	'archive.table.journal_mention': (p) =>
		p.count === 1 ? 'Tagebuch-Erwähnung' : 'Tagebuch-Erwähnungen',
	'archive.table.interaction': (p) => (p.count === 1 ? 'Kontakt' : 'Kontakte'),
	'archive.table.interaction_participant': (p) => (p.count === 1 ? 'Beteiligter' : 'Beteiligte'),
	'archive.table.photo': (p) => (p.count === 1 ? 'Foto' : 'Fotos'),
	'archive.table.tag': (p) => (p.count === 1 ? 'Schlagwort' : 'Schlagwörter'),
	'archive.table.contact_tag': (p) =>
		p.count === 1 ? 'beschlagwortete Person' : 'beschlagwortete Menschen',
	'archive.table.circle': (p) => (p.count === 1 ? 'Kreis' : 'Kreise'),
	'archive.table.circle_membership': (p) => (p.count === 1 ? 'Kreismitglied' : 'Kreismitglieder'),
	'archive.table.activity_log': (p) => (p.count === 1 ? 'Protokolleintrag' : 'Protokolleinträge'),

	'archive.mention.noteMentions': 'Notiz-Erwähnungen',
	'archive.mention.journalMentions': 'Tagebuch-Erwähnungen',
	'archive.mention.touchpointParticipants': 'Kontakt-Beteiligte',

	'archive.warning.personWithoutName': 'Eine Person ohne Kennung oder Namen wurde ausgelassen.',
	'archive.warning.photoWithoutFile': 'Ein Foto ohne Datei wurde ausgelassen.',
	'archive.warning.photoBadPath': (p) =>
		`Ein Foto mit einem unbrauchbaren Dateipfad („${p.file}“) wurde ausgelassen.`,
	'archive.warning.pointedAtMissingPeople': (p) =>
		`Einige ${p.what} verwiesen auf Menschen, die das Archiv nicht enthält, und wurden ausgelassen.`,
	'archive.warning.contactFieldIncomplete':
		'Eine Kontaktangabe ohne Art oder Wert wurde ausgelassen.',
	'archive.warning.importantDateIncomplete':
		'Ein wichtiges Datum ohne Tag oder Art wurde ausgelassen.',
	'archive.warning.noteWithoutText': 'Eine Notiz ohne Text wurde ausgelassen.',
	'archive.warning.journalEntryIncomplete':
		'Ein Tagebucheintrag ohne Tag oder Text wurde ausgelassen.',
	'archive.warning.touchpointIncomplete': 'Ein Kontakt ohne Art oder Datum wurde ausgelassen.',
	'archive.warning.tagWithoutName': 'Ein Schlagwort ohne Namen wurde ausgelassen.',
	'archive.warning.tagsNotInList':
		'Einige Schlagwörter an Menschen stehen nicht in der Schlagwortliste des Archivs und wurden ausgelassen.',
	'archive.warning.circleWithoutName': 'Ein Kreis ohne Namen wurde ausgelassen.',
	'archive.warning.circleMissingParent': (p) =>
		`„${p.name}“ lag in einem Kreis, den das Archiv nicht enthält; er wird für sich allein wiederhergestellt.`,
	'archive.warning.circleMemberMissing': (p) =>
		`Ein Mitglied von „${p.name}“ ist nicht im Archiv und wurde ausgelassen.`,
	'archive.warning.relationshipTypeWithoutName':
		'Eine Beziehungsart ohne Namen wurde ausgelassen.',
	'archive.warning.relationshipMissingEnd':
		'Eine Beziehung, der ein Ende fehlt, wurde ausgelassen.',
	'archive.warning.relationshipsMissingPeople':
		'Einige Beziehungen verbanden Menschen, die das Archiv nicht enthält, und wurden ausgelassen.',
	'archive.warning.relationshipUnknownType':
		'Einige Beziehungen waren von einer Art, die dieses Stella nicht kennt, und wurden ausgelassen. Lege die Beziehungsart an und importiere erneut.',

	'archive.warning.imagesMissing': (p) =>
		p.count === 1
			? 'Ein im Dokument genanntes Bild war nicht im Archiv; dieses Foto wird als fehlend angezeigt.'
			: `${p.count} im Dokument genannte Bilder waren nicht im Archiv; diese Fotos werden als fehlend angezeigt.`,
	'archive.error.unusableFileName': (p) =>
		`Dieses Archiv enthält einen unbrauchbaren Dateinamen: „${p.name}“.`,
	'archive.error.noDocument': (p) =>
		`Dieses Archiv enthält kein ${p.document} und ist damit kein Stella-Archiv.`,
	'archive.restoredSummary': (p) => `${p.people} aus einem Archiv von ${p.household} wiederhergestellt`,
	'archive.peopleCount': (p) => (p.count === 1 ? '1 Person' : `${p.count} Menschen`),

	'archive.error.notAnArchive': 'Diese Datei enthält kein Stella-Archiv.',
	'archive.error.noFormatLine':
		'Diese Datei ist kein Stella-Archiv — ihr fehlt die Zeile „format: stella-archive“.',
	'archive.error.noVersion': 'Dieses Archiv sagt nicht, welche Formatversion es hat.',
	'archive.error.newerVersion': (p) =>
		`Dieses Archiv wurde von einer neueren Stella-Version geschrieben (Format ${p.fileVersion}, diese liest ${p.reads}). Aktualisiere zuerst Stella.`,
	'archive.error.foreignHousehold': (p) =>
		`Dieses Archiv wurde auf diesem Server schon in einen anderen Haushalt eingelesen (${p.table} „${p.id}“) und kann hier nicht wiederhergestellt werden.`,
	'archive.error.badHeaderField': 'Das Archiv hat ein Kopffeld, das keine Zahl ist.',
	'archive.error.notATar': 'Diese Datei ist kein Archiv.',
	'archive.error.damaged':
		'Diese Datei ist kein Stella-Archiv — oder sie wurde bei der Übertragung beschädigt.',
	'archive.error.truncated': (p) => `Das Archiv endet mitten in „${p.name}“.`,
	'archive.error.unsupportedEntry': (p) =>
		`„${p.name}“ ist eine Art von Archiveintrag (Typ ${p.typeflag}), die dieser Leser nicht annimmt.`
};
