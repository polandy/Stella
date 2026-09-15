/*
 * How the install offer stands on a device (docs/02 §2.18).
 *
 * Pure, and separate from the rune that holds the browser events, because this is the part
 * with branches in it: three states, one of which is reached only on Safari and another only
 * after an install anybody reviewing this cannot perform.
 */

/** How the install offer stands on this device. */
export type InstallState =
	/** Already running from a home screen — there is nothing to offer. */
	| 'installed'
	/** The browser has handed us a prompt we can raise on demand. */
	| 'ready'
	/** No prompt to raise: Safari, or a browser that has decided against offering one. */
	| 'unavailable';

/** What a device can tell us about itself. */
export interface InstallSignals {
	/** Whether Stella is already running as an installed app. */
	installed: boolean;
	/** Whether a `beforeinstallprompt` event is being held for us. */
	hasPrompt: boolean;
}

/**
 * Being installed wins: a browser may still hold a prompt for an app that is already on the
 * home screen, and offering to install it again reads as a bug.
 */
export function installStateFrom({ installed, hasPrompt }: InstallSignals): InstallState {
	if (installed) return 'installed';
	return hasPrompt ? 'ready' : 'unavailable';
}
