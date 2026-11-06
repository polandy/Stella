/*
 * Which menu path installs Stella by hand on this browser (docs/02 §2.18).
 *
 * Only asked when the browser handed us no install prompt. Sniffing the user agent is a guess,
 * and that is fine here: a wrong guess shows a hint for another browser, never a broken button,
 * and the fallback still sends the reader to their own browser menu.
 */

/** The by-hand install path a hint can name. */
export type InstallRoute =
	/** iPhone or iPad, any browser: Share → Add to Home Screen. */
	| 'ios'
	/** Android, any browser: the ⋮ menu → Add to Home screen. */
	| 'android'
	/** Safari on a Mac: File → Add to Dock. */
	| 'macSafari'
	/** Anything else: look in the browser menu. */
	| 'other';

/** What the browser tells us about itself. */
export interface BrowserSignals {
	userAgent: string;
	/** `navigator.maxTouchPoints` — what tells an iPad apart from the Mac it claims to be. */
	maxTouchPoints: number;
}

/** Engines that put "Safari" in their user agent without being Safari. */
const NOT_SAFARI = /Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg\/|OPR\/|Firefox/;

export function installRouteFor({ userAgent, maxTouchPoints }: BrowserSignals): InstallRoute {
	if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios';
	if (/Android/.test(userAgent)) return 'android';
	if (/Macintosh/.test(userAgent)) {
		if (maxTouchPoints > 1) return 'ios';
		if (/Safari\//.test(userAgent) && !NOT_SAFARI.test(userAgent)) return 'macSafari';
	}
	return 'other';
}
