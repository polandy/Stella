/* Installing Stella on a device, and what it can still show when the network is gone (docs/02 §2.18). */

import type { PwaMessages } from '../en/pwa';

export const pwa: PwaMessages = {
	'pwa.name': 'Stella',
	'pwa.shortName': 'Stella',
	'pwa.description': 'Die Menschen deiner Familie – und wie sie zusammengehören.',

	'pwa.offline.title': 'Keine Verbindung',
	'pwa.offline.body':
		'Stella läuft in eurem eigenen Netzwerk und ist von hier aus gerade nicht erreichbar. Alle, die du sehen kannst, bleiben in der App lesbar, ebenso die Seiten, die du geöffnet hast.',
	'pwa.offline.retry': 'Erneut versuchen',
	'pwa.offline.banner': 'Offline – du siehst, was auf diesem Gerät schon da war.',
	'pwa.offline.bannerAsOf': (p: { when: string }) => `Offline – von diesem Gerät, Stand ${p.when}.`,
	'pwa.offline.keptToday': (p: { time: string }) => `heute ${p.time}`,
	'pwa.offline.keptYesterday': (p: { time: string }) => `gestern ${p.time}`,
	'pwa.offline.keptOn': (p: { date: string; time: string }) => `${p.date} ${p.time}`,

	'pwa.install.heading': 'Dieses Gerät',
	'pwa.install.label': 'Stella installieren',
	'pwa.install.hint':
		'Auf dem Startbildschirm öffnet Stella sich in einem eigenen Fenster, und alle, die du sehen kannst, bleiben auch ohne Verbindung lesbar.',
	'pwa.install.action': 'Installieren',
	'pwa.install.installed': 'Stella ist auf diesem Gerät installiert.',
	'pwa.install.byHand.ios':
		'Dieser Browser hat keinen Installieren-Knopf. Tippe auf Teilen, dann auf Zum Home-Bildschirm.',
	'pwa.install.byHand.android':
		'Dieser Browser hat keinen Installieren-Knopf. Öffne das ⋮-Menü und wähle Zum Startbildschirm hinzufügen.',
	'pwa.install.byHand.macSafari':
		'Dieser Browser hat keinen Installieren-Knopf. Wähle im Menü Ablage den Punkt Zum Dock hinzufügen.',
	'pwa.install.byHand.other':
		'Dieser Browser hat keinen Installieren-Knopf. Such in seinem Menü nach Installieren oder Zum Startbildschirm hinzufügen.'
};
