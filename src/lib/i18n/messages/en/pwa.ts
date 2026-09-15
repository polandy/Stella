/* Installing Stella on a device, and what it can still show when the network is gone (docs/02 §2.18). */

export const pwa = {
	'pwa.name': 'Stella',
	'pwa.shortName': 'Stella',
	'pwa.description': 'Your family’s people, and how they belong together.',

	/* The screen shown when a page was never opened on this device and cannot be fetched now. */
	'pwa.offline.title': 'No connection',
	'pwa.offline.body':
		'Stella lives on your own network, so there is nothing to reach from here right now. Pages you have already opened are still readable.',
	'pwa.offline.retry': 'Try again'
};

/** The key set every translation of this area has to provide. */
export type PwaMessages = typeof pwa;
