import type { ImportMessages } from '../en/import';

/** German for `messages/en/import.ts`. */
export const importer: ImportMessages = {
	'import.title': 'Menschen importieren',
	'import.intro':
		'Ein Export deines Monica wird hier zu Menschen, Beziehungen, Notizen, Kontakten, Schlagwörtern und Fotos; eine vCard bringt allein die Menschen. Stella erkennt selbst, welches der drei du hochgeladen hast. Geschrieben wird nichts, bevor du bestätigst.',
	'import.steps': 'Schritte',
	'import.step.upload': 'hochladen',
	'import.step.preview': 'vorschau',
	'import.step.photos': 'Import & Fotos',
	'import.fileLabel':
		'Monica-Export — JSON (.json) oder Datenbank-Dump (.sql) — oder eine vCard (.vcf), einfach oder gzip-gepackt',
	'import.fileHint.monica':
		'In Monica: Settings → Export data liefert die JSON-Datei samt Bildern. Eine vCard kommt aus jedem Adressbuch — Telefon, Mailprogramm, Google Contacts — und enthält nur die Menschen. Für einen Dump auf einem selbst gehosteten Monica stattdessen:',
	'import.visibilityLegend': 'Alles Importierte ist',
	'import.visibility.shared': 'Mit dem Haushalt geteilt',
	'import.visibility.private': 'Privat für mich',
	'import.preview': 'Vorschau',
	'import.whatWillBeImported': 'Was importiert wird',
	'import.newTypes': 'Neue Beziehungsarten, weil Stella keine mitgelieferte Entsprechung hat:',
	'import.leftOut': 'Ausgelassen — und warum',
	'import.startOver': 'Von vorn beginnen',
	'import.importNow': 'Jetzt importieren',
	'import.done': (p) =>
		`${p.contacts} Menschen, ${p.relationships} Beziehungen, ${p.notes} Notizen, ${p.interactions} Kontakte und ${p.tags} Schlagwörter importiert.`,
	'import.nothingTwice': 'Alles war schon da, es wurde nichts doppelt geschrieben.',
	'import.photos': (p) => `Fotos (${p.count})`,
	'import.photos.embedded':
		'Dein Export trägt die Bilder in sich, es gibt also keinen Ordner, auf den du zeigen müsstest. Jedes wird beim Eintreffen in deinem Browser verkleinert; sobald „fertig“ dasteht, kannst du die Seite schließen.',
	'import.photos.folder':
		'Zeige mit der Dateiauswahl auf Monicas Fotoordner (storage/app/public/photos). Jede Datei wird in deinem Browser verkleinert und hochgeladen; sobald „fertig“ dasteht, kannst du die Seite schließen.',
	'import.photos.folderLabel': 'Monica-Fotoordner',
	'import.photos.store': 'Fotos speichern',
	'import.photos.storing': 'Wird gespeichert…',
	'import.progress': (p) =>
		`${p.done} von ${p.total} · ${p.stored} gespeichert` +
		(p.already ? `, ${p.already} schon vorhanden` : '') +
		(p.missing ? `, ${p.missing} nicht im Ordner` : '') +
		(p.failed ? `, ${p.failed} fehlgeschlagen` : ''),
	'import.finish': 'Fertig',

	'import.count.contacts': 'Kontakte',
	'import.count.contactFields': 'Kontaktangaben',
	'import.count.relationships': 'Beziehungen',
	'import.count.relationshipTypes': 'Beziehungsarten',
	'import.count.notes': 'Notizen',
	'import.count.interactions': 'Kontakte',
	'import.count.tags': 'Schlagwörter',
	'import.count.photos': 'Fotos',

	'import.thing.contact': (p) => (p.count === 1 ? 'Kontakt' : 'Kontakte'),
	'import.thing.relationship': (p) => (p.count === 1 ? 'Beziehung' : 'Beziehungen'),
	'import.thing.contactField': (p) => (p.count === 1 ? 'Kontaktangabe' : 'Kontaktangaben'),
	'import.thing.address': (p) => (p.count === 1 ? 'Anschrift' : 'Anschriften'),
	'import.thing.note': (p) => (p.count === 1 ? 'Notiz' : 'Notizen'),
	'import.thing.gift': (p) => (p.count === 1 ? 'Geschenk' : 'Geschenke'),
	'import.thing.lifeEvent': (p) => (p.count === 1 ? 'Lebensereignis' : 'Lebensereignisse'),
	'import.thing.pet': (p) => (p.count === 1 ? 'Haustier' : 'Haustiere'),
	'import.thing.activity': (p) => (p.count === 1 ? 'Aktivität' : 'Aktivitäten'),
	'import.thing.photo': (p) => (p.count === 1 ? 'Foto' : 'Fotos'),
	'import.thing.journalEntry': (p) => (p.count === 1 ? 'Tagebucheintrag' : 'Tagebucheinträge'),
	'import.thing.reminder': (p) => (p.count === 1 ? 'Erinnerung' : 'Erinnerungen'),

	'import.why.deletedInMonica': 'in Monica gelöscht',
	'import.why.refersToDeletedContact': 'verweist auf einen gelöschten Kontakt',
	'import.why.belongsToDeletedContact': 'gehört zu einem gelöschten Kontakt',
	'import.why.empty': 'leer',
	'import.why.linkedToNoPerson': 'mit niemandem verknüpft',
	'import.why.linkedOnlyToDeletedContacts': 'nur mit gelöschten Kontakten verknüpft',
	'import.why.attachedToNoPerson': 'zu niemandem gehörend',
	'import.why.notAttachedToPerson': 'keiner Person zugeordnet',
	'import.why.remindersDerived': 'Stella leitet Geburtstagserinnerungen selbst her',

	'import.warning.customType': (p) =>
		`Für die Beziehungsart „${p.name}“ hat Stella keine Entsprechung; sie wurde als eigene Art angelegt.`,
	'import.warning.manyUsers': (p) =>
		`Monica hatte ${p.count} Benutzerkonten; alles wird dem importierenden Mitglied zugeschrieben.`,
	'import.warning.vcardPeopleOnly':
		'Eine vCard enthält nur Menschen — Beziehungen, Kontakte oder Tagebucheinträge werden daraus nicht gelesen.',
	'import.warning.jsonNoHowWeMet':
		'Monicas JSON-Export enthält weder „wie ihr euch kennengelernt habt“ noch wo; dieser Freitext steht nicht in der Datei.',

	'import.note.gift': 'Geschenk',
	'import.note.lifeEvent': 'Lebensereignis',
	'import.note.pet': 'Haustier',
	'import.note.monicaActivity': (p) => `(Monica-Aktivität: ${p.kind})`,
	'import.metThrough': (p) => `Über ${p.name}`,
	'import.metThroughInfo': (p) => `${p.info} (über ${p.name})`,

	'import.error.chooseFile': 'Bitte wähle die Monica-Export- oder vCard-Datei zum Importieren.',
	'import.error.sessionMissing': 'Die Import-Sitzung fehlt. Bitte lade den Dump erneut hoch.',
	'import.error.sessionGone':
		'Der hochgeladene Dump ist nicht mehr verfügbar. Bitte lade ihn erneut hoch.',
	'import.error.sessionOver': 'Die Import-Sitzung ist beendet; beginne erneut beim Export.',
	'import.error.tooLarge': 'Die Datei ist größer, als dieser Importer annimmt.',
	'import.error.notJson': 'Diese Datei beginnt wie JSON, ließ sich aber nicht als JSON lesen.',
	'import.error.notMonicaJson': 'Diese Datei ist kein Monica-JSON-Export.',
	'import.error.jsonNoUuid': (p) => `Ein Eintrag (${p.what}) in diesem Export hat keine uuid.`,
	'import.error.jsonUnsupported': (p) => p.detail,
	'import.error.vcardOverlap': 'Eine Karte in dieser Datei beginnt, bevor die vorige endete.',
	'import.error.vcardEndWithoutBegin': 'Diese Datei beendet eine Karte, die nie begonnen hat.',
	'import.error.vcardUnclosed': 'Eine Karte in dieser Datei wurde nie mit END:VCARD geschlossen.',
	'import.error.notVcard': 'Diese Datei ist keine vCard — sie enthält kein BEGIN:VCARD.',
	'import.error.vcardNameless': (p) =>
		`Eine Karte in dieser Datei nennt niemanden — sie hat weder FN noch N (Karte ${p.index}).`,
	'import.error.dumpMalformedInsert': (p) =>
		`Fehlerhaftes INSERT für die Tabelle ${p.table}: ${p.what}.`,
	'import.error.notSqlDump':
		'Das sieht nicht nach einem MariaDB-/MySQL-Dump aus: kein CREATE TABLE gefunden.',
	'import.error.insertWithoutCreate': (p) =>
		`INSERT in ${p.table} ohne ein zugehöriges CREATE TABLE.`,
	'import.error.columnCountMismatch': (p) => p.detail,
	'import.error.noSuchTable': (p) => `Der Dump hat keine Tabelle namens ${p.name}.`,
	'import.error.noSuchColumn': (p) => `Die Tabelle ${p.table} hat keine Spalte ${p.column}.`,
	'import.error.notMonicaDump': (p) =>
		`Dieser Dump hat keine Tabelle ${p.table} — ist es wirklich eine Monica-Datenbank?`,
	'import.error.photoNotInImport': 'Dieses Foto gehört nicht zum Import.',
	'import.error.pictureNotCarried':
		'Dieser Export trägt das Bild nicht in sich; zeige auf Monicas Fotoordner.',
	'import.error.missingPhotoFields': 'Es fehlen Felder des Foto-Uploads.',
	'import.error.missingToken': 'Token oder Foto-Kennung fehlt.'
};
