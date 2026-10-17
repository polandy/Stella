/* Private entries blurred on their author's screen until shown (docs/02 §2.10.1). */

import type { PrivacyMessages } from '../en/privacy';

export const privacy: PrivacyMessages = {
	'privacy.veil.tapToShow': 'Tippen zum Anzeigen',
	'privacy.veil.unlockToShow': 'Entsperren zum Anzeigen',
	'privacy.veil.hide': 'Verbergen',
	'privacy.veil.note': 'Private Notiz, verborgen. Anzeigen',
	'privacy.veil.moment': 'Privater Moment, verborgen. Anzeigen',
	'privacy.veil.interaction': 'Privater Kontakt, verborgen. Anzeigen',
	'privacy.veil.photo': 'Privates Foto, verborgen. Anzeigen',
	'privacy.veil.text': 'Privater Text, verborgen. Anzeigen',
	'privacy.veil.hidden': 'Privat, verborgen',

	'privacy.lock.count': (p: { n: number }) => `${p.n} privat`,
	'privacy.lock.showAll': (p: { n: number }) =>
		p.n === 1 ? '1 privaten Eintrag anzeigen' : `${p.n} private Einträge anzeigen`,
	'privacy.lock.shown': 'Privates sichtbar',
	'privacy.lock.lockAgain': (p: { time: string }) =>
		`Privates sichtbar, noch ${p.time}. Wieder verbergen`,
	'privacy.unlock.failed': 'Das konnte nicht bestätigt werden, sie bleiben verschwommen.',

	'privacy.settings.heading': 'Privatsphäre',
	'privacy.settings.blur': 'Meine privaten Einträge verschwimmen lassen',
	'privacy.settings.blurHint':
		'Titel, Text und Foto deiner privaten Notizen, Momente, Kontakte und Fotos bleiben verschwommen, bis du sie anzeigst. Sonst sieht sie ohnehin niemand; das ist gegen den Blick über die Schulter.',
	'privacy.settings.blurOn': 'Deine privaten Einträge verschwimmen wieder',
	'privacy.settings.blurOff': 'Private Einträge sind jetzt lesbar wie alle anderen',
	'privacy.settings.blurFailed': 'Das konnte nicht gespeichert werden. Versuch es noch einmal.',
	'privacy.unlock.heading': 'Geräte-Entsperrung auf diesem Gerät',
	'privacy.unlock.setUpMark': 'Eingerichtet',
	'privacy.unlock.since': (p: { day: string }) =>
		`Hier eingerichtet seit ${p.day}. Zum Anzeigen privater Einträge wird nach Fingerabdruck, Gesicht oder PIN gefragt.`,
	'privacy.unlock.none':
		'Nicht eingerichtet. Bis dahin zeigt ein Tippen einen privaten Eintrag. Damit wird zuerst nach Fingerabdruck, Gesicht oder PIN gefragt.',
	'privacy.unlock.unsupported':
		'Dieser Browser kann keinen Passkey nutzen, daher zeigt hier ein Tippen einen privaten Eintrag.',
	'privacy.unlock.checking': 'Prüfe, was dieser Browser kann …',
	'privacy.unlock.setUp': 'Geräte-Entsperrung einrichten',
	'privacy.unlock.setUpDone': 'Geräte-Entsperrung auf diesem Gerät eingerichtet',
	'privacy.unlock.setUpFailed': 'Die Geräte-Entsperrung wurde nicht eingerichtet.',
	'privacy.unlock.forget': 'Auf diesem Gerät vergessen …',
	'privacy.unlock.forgetHeading': 'Geräte-Entsperrung auf diesem Gerät vergessen?',
	'privacy.unlock.forgetStays':
		'Private Einträge bleiben verschwommen; ein Tippen zeigt sie hier wieder.',
	'privacy.unlock.forgetPasskey':
		'Der Passkey bleibt in deinem Passwortmanager. Lösch ihn dort, wenn du magst.',
	'privacy.unlock.forgetOthers': 'Deine anderen Geräte behalten ihren.',
	'privacy.unlock.forgetConfirm': 'Vergessen',
	'privacy.unlock.keep': 'Behalten',
	'privacy.unlock.forgotten': 'Auf diesem Gerät vergessen'
};
