import { describe, expect, it } from 'bun:test';
import { installRouteFor } from './install-route';

const IPHONE_SAFARI =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1';
const MAC_SAFARI =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
const MAC_CHROME =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const ANDROID_CHROME =
	'Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const ANDROID_FIREFOX = 'Mozilla/5.0 (Android 15; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0';
const LINUX_FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0';

describe('how to install by hand', () => {
	it('points an iPhone to the Share sheet, whichever browser it runs', () => {
		// Every iOS browser is WebKit underneath, and each offers Add to Home Screen from Share.
		expect(installRouteFor({ userAgent: IPHONE_SAFARI, maxTouchPoints: 5 })).toBe('ios');
		expect(installRouteFor({ userAgent: IPHONE_CHROME, maxTouchPoints: 5 })).toBe('ios');
	});

	it('treats an iPad as iOS although it says it is a Mac', () => {
		// iPadOS asks for the desktop site by default; only the touch screen gives it away.
		expect(installRouteFor({ userAgent: MAC_SAFARI, maxTouchPoints: 5 })).toBe('ios');
	});

	it('points Safari on a Mac to File → Add to Dock', () => {
		expect(installRouteFor({ userAgent: MAC_SAFARI, maxTouchPoints: 0 })).toBe('macSafari');
	});

	it('points any Android browser to its menu', () => {
		expect(installRouteFor({ userAgent: ANDROID_CHROME, maxTouchPoints: 5 })).toBe('android');
		expect(installRouteFor({ userAgent: ANDROID_FIREFOX, maxTouchPoints: 5 })).toBe('android');
	});

	it('falls back to the browser menu everywhere else', () => {
		// Chrome on a Mac names Safari in its user agent too; it is not Safari.
		expect(installRouteFor({ userAgent: MAC_CHROME, maxTouchPoints: 0 })).toBe('other');
		expect(installRouteFor({ userAgent: LINUX_FIREFOX, maxTouchPoints: 0 })).toBe('other');
	});
});
