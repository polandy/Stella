/* Installing Stella on a device, and what it can still show when the network is gone (docs/02 §2.18). */

export const pwa = {
	'pwa.name': 'Stella',
	'pwa.shortName': 'Stella',
	'pwa.description': 'Your family’s people, and how they belong together.',

	/* The screen shown when a page was never opened on this device and cannot be fetched now. */
	'pwa.offline.title': 'No connection',
	'pwa.offline.body':
		'Stella lives on your own network, so there is nothing to reach from here right now. Pages you have already opened are still readable.',
	'pwa.offline.retry': 'Try again',
	/* Shown over the app while the device has no connection and pages come off the cache. */
	'pwa.offline.banner': 'Offline — showing what this device already had.',

	/* Settings → This device: the standing offer to install, never a prompt over the page. */
	'pwa.install.heading': 'This device',
	'pwa.install.label': 'Install Stella',
	'pwa.install.hint':
		'Added to the home screen, Stella opens in its own window and keeps the pages you have read available without a connection.',
	'pwa.install.action': 'Install',
	'pwa.install.installed': 'Stella is installed on this device.',
	'pwa.install.byHand':
		'This browser has no install button. In Safari, use Share → Add to Home Screen.'
};

/** The key set every translation of this area has to provide. */
export type PwaMessages = typeof pwa;
