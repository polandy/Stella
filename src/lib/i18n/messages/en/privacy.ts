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
	/* Read out for a blurred snippet inside a link, which has no Show of its own. */
	'privacy.veil.hidden': 'Private, hidden',

	/* The page header's lock: how many are blurred, or how long they stay shown. */
	'privacy.lock.count': (p: { n: number }) => `${p.n} private`,
	'privacy.lock.showAll': (p: { n: number }) =>
		p.n === 1 ? 'Show 1 private entry' : `Show ${p.n} private entries`,
	'privacy.lock.shown': 'Private shown',
	'privacy.lock.lockAgain': (p: { time: string }) =>
		`Private shown, ${p.time} left. Blur them again`,
	'privacy.unlock.failed': 'Couldn’t confirm it’s you, so they stay blurred.',

	/* Settings · Privacy: the member's switch and this device's unlock. */
	'privacy.settings.heading': 'Privacy',
	'privacy.settings.blur': 'Blur my private entries',
	'privacy.settings.blurHint':
		'The title, text and photo of your private notes, moments, touchpoints and photos stay blurred until you show them. Nobody else sees them anyway; this is for a glance over your shoulder.',
	'privacy.settings.blurOn': 'Your private entries are blurred again',
	'privacy.settings.blurOff': 'Private entries read like any other now',
	'privacy.settings.blurFailed': 'Couldn’t save that. Try again.',
	'privacy.unlock.heading': 'Device unlock on this device',
	'privacy.unlock.setUpMark': 'Set up',
	'privacy.unlock.since': (p: { day: string }) =>
		`Set up here since ${p.day}. Showing your private entries asks for your fingerprint, face or PIN.`,
	'privacy.unlock.none':
		'Not set up. For now a tap shows a private entry. With it, your fingerprint, face or PIN is asked first.',
	'privacy.unlock.unsupported':
		'This browser can’t use a passkey, so a tap shows a private entry here.',
	'privacy.unlock.checking': 'Checking what this browser can do…',
	'privacy.unlock.setUp': 'Set up device unlock',
	'privacy.unlock.setUpDone': 'Device unlock set up on this device',
	'privacy.unlock.setUpFailed': 'Device unlock wasn’t set up.',
	'privacy.unlock.forget': 'Forget on this device…',
	'privacy.unlock.forgetHeading': 'Forget device unlock on this device?',
	'privacy.unlock.forgetStays': 'Private entries stay blurred; a tap shows them here again.',
	'privacy.unlock.forgetPasskey':
		'The passkey stays in your password manager. Delete it there if you like.',
	'privacy.unlock.forgetOthers': 'Your other devices keep theirs.',
	'privacy.unlock.forgetConfirm': 'Forget',
	'privacy.unlock.keep': 'Keep it',
	'privacy.unlock.forgotten': 'Forgotten on this device'
};

/** The key set every translation of this area has to provide. */
export type PrivacyMessages = typeof privacy;
