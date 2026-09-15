/* Installing Stella on a device, and what it can still show when the network is gone (docs/02 §2.18). */

import type { PwaMessages } from '../en/pwa';

export const pwa: PwaMessages = {
	'pwa.name': 'Stella',
	'pwa.shortName': 'Stella',
	'pwa.description': 'Die Menschen deiner Familie – und wie sie zusammengehören.',

	'pwa.offline.title': 'Keine Verbindung',
	'pwa.offline.body':
		'Stella läuft in eurem eigenen Netzwerk und ist von hier aus gerade nicht erreichbar. Seiten, die du schon geöffnet hast, kannst du weiterhin lesen.',
	'pwa.offline.retry': 'Erneut versuchen'
};
