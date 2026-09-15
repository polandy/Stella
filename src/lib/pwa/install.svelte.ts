import { browser } from '$app/environment';

/*
 * Whether this device can be offered an install, and doing it (docs/02 §2.18).
 *
 * Chromium fires `beforeinstallprompt` once, early, and only when it considers the app
 * installable — long before anyone opens Settings. So the event is caught at module load and
 * held; the Settings card reads what is here rather than listening for something that has
 * already happened. Safari fires nothing and has no API: there the card says how to do it by
 * hand instead of pretending a button would work.
 */

/** The Chromium-only event. Not in lib.dom, so its shape is named here. */
interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>;
	readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** How the install offer stands on this device. */
export type InstallState =
	/** Already running from a home screen — there is nothing to offer. */
	| 'installed'
	/** The browser has offered us a prompt we can raise on demand. */
	| 'ready'
	/** No prompt available: Safari, or a browser that has decided against it. */
	| 'unavailable';

let deferred: BeforeInstallPromptEvent | null = $state(null);
let installed = $state(false);

if (browser) {
	window.addEventListener('beforeinstallprompt', (event) => {
		// Keeping the event is what lets the offer live in Settings rather than as a bar the
		// browser drops over the page.
		event.preventDefault();
		deferred = event as BeforeInstallPromptEvent;
	});
	window.addEventListener('appinstalled', () => {
		installed = true;
		deferred = null;
	});
	installed = window.matchMedia('(display-mode: standalone)').matches;
}

/** How the install offer stands, as a rune the Settings card can read. */
export const install = {
	get state(): InstallState {
		if (installed) return 'installed';
		return deferred ? 'ready' : 'unavailable';
	},

	/** Raise the browser's own install prompt. Only meaningful while the state is `ready`. */
	async offer(): Promise<void> {
		const event = deferred;
		if (!event) return;

		await event.prompt();
		const { outcome } = await event.userChoice;
		// The event is single-use whichever way it went; a second prompt needs a new one.
		deferred = null;
		if (outcome === 'accepted') installed = true;
	}
};
