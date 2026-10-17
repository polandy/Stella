/* Private entries blurred on their author's screen until shown (docs/02 §2.10.1). */

export const privacy = {
	/* On the veil itself: a tap shows the entry, or asks the device's check first. */
	'privacy.veil.tapToShow': 'Tap to show',
	'privacy.veil.unlockToShow': 'Unlock to show',
	/* Beside the Private mark of an entry a tap showed. */
	'privacy.veil.hide': 'Hide',
	/* The veil's name for a screen reader, by what is under it. */
	'privacy.veil.note': 'Private note, hidden. Show',
	'privacy.veil.moment': 'Private moment, hidden. Show',
	'privacy.veil.interaction': 'Private interaction, hidden. Show',
	'privacy.veil.photo': 'Private photo, hidden. Show',
	'privacy.veil.text': 'Private text, hidden. Show',

	/* The page header's lock: how many are blurred, or how long they stay shown. */
	'privacy.lock.count': (p: { n: number }) => `${p.n} private`,
	'privacy.lock.showAll': (p: { n: number }) =>
		p.n === 1 ? 'Show 1 private entry' : `Show ${p.n} private entries`,
	'privacy.lock.shown': 'Private shown',
	'privacy.lock.lockAgain': (p: { time: string }) =>
		`Private shown, ${p.time} left. Blur them again`,
	'privacy.unlock.failed': 'Couldn’t confirm it’s you, so they stay blurred.'
};

/** The key set every translation of this area has to provide. */
export type PrivacyMessages = typeof privacy;
