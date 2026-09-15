/* Installing Stella on a device, and what it can still show when the network is gone (docs/02 §2.18). */

import type { PwaMessages } from '../en/pwa';

export const pwa: PwaMessages = {
	'pwa.name': 'Stella',
	'pwa.shortName': 'Stella',
	'pwa.description': 'Die Menschen deiner Familie – und wie sie zusammengehören.',

	'pwa.offline.title': 'Keine Verbindung',
	'pwa.offline.body':
		'Stella läuft in eurem eigenen Netzwerk und ist von hier aus gerade nicht erreichbar. Seiten, die du schon geöffnet hast, kannst du weiterhin lesen.',
	'pwa.offline.retry': 'Erneut versuchen',
	'pwa.offline.banner': 'Offline – du siehst, was auf diesem Gerät schon da war.',

	'pwa.install.heading': 'Dieses Gerät',
	'pwa.install.label': 'Stella installieren',
	'pwa.install.hint':
		'Auf dem Startbildschirm öffnet Stella sich in einem eigenen Fenster, und gelesene Seiten bleiben auch ohne Verbindung verfügbar.',
	'pwa.install.action': 'Installieren',
	'pwa.install.installed': 'Stella ist auf diesem Gerät installiert.',
	'pwa.install.byHand':
		'Dieser Browser hat keinen Installieren-Knopf. In Safari: Teilen → Zum Home-Bildschirm.'
};
