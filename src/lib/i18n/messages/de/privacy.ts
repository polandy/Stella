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

	'privacy.lock.count': (p: { n: number }) => `${p.n} privat`,
	'privacy.lock.showAll': (p: { n: number }) =>
		p.n === 1 ? '1 privaten Eintrag anzeigen' : `${p.n} private Einträge anzeigen`,
	'privacy.lock.shown': 'Privates sichtbar',
	'privacy.lock.lockAgain': (p: { time: string }) =>
		`Privates sichtbar, noch ${p.time}. Wieder verbergen`,
	'privacy.unlock.failed': 'Das konnte nicht bestätigt werden, sie bleiben verschwommen.'
};
