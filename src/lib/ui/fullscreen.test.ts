import { describe, expect, it } from 'bun:test';
import { dismissesFullscreenOnDrag } from './fullscreen';

/*
 * Which devices get the graph's app-level full screen instead of the browser's (docs/05 §5.8,
 * docs/04 §4.9): only iPadOS/iOS, where Safari reads a downward drag on a Fullscreen-API
 * element as "swipe to dismiss". Any other touch device keeps the native Fullscreen API.
 */

const IPHONE =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPAD = IPHONE.replace(/iPhone/g, 'iPad');
const IPADOS_AS_A_MAC =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const ANDROID =
	'Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const WINDOWS =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

describe('dismissesFullscreenOnDrag', () => {
	it('picks an iPhone and an iPad by their user agent', () => {
		expect(
			dismissesFullscreenOnDrag({ userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 })
		).toBe(true);
		expect(
			dismissesFullscreenOnDrag({ userAgent: IPAD, platform: 'iPad', maxTouchPoints: 5 })
		).toBe(true);
	});

	it('sees through iPadOS calling itself a Mac, by its touch points', () => {
		expect(
			dismissesFullscreenOnDrag({
				userAgent: IPADOS_AS_A_MAC,
				platform: 'MacIntel',
				maxTouchPoints: 5
			})
		).toBe(true);
	});

	it('leaves a real Mac, an Android phone and a touch laptop on the native Fullscreen API', () => {
		expect(
			dismissesFullscreenOnDrag({
				userAgent: IPADOS_AS_A_MAC,
				platform: 'MacIntel',
				maxTouchPoints: 0
			})
		).toBe(false);
		expect(
			dismissesFullscreenOnDrag({ userAgent: ANDROID, platform: 'Linux armv81', maxTouchPoints: 5 })
		).toBe(false);
		expect(
			dismissesFullscreenOnDrag({ userAgent: WINDOWS, platform: 'Win32', maxTouchPoints: 10 })
		).toBe(false);
	});
});
