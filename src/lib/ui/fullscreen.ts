/*
 * Which devices cannot be trusted with the browser's own Fullscreen API for the graph
 * (docs/05 §5.8, docs/04 §4.9).
 *
 * iPadOS/iOS Safari reads a downward drag on a Fullscreen-API element as "swipe to dismiss",
 * and panning the canvas is exactly that drag. There is no feature-detectable signal for the
 * quirk, so this is the codebase's one user-agent sniff. Every browser on iOS is Safari's
 * WebKit underneath, so it keys off the device, not the nominal browser.
 */

/** As much of `navigator` as the decision reads. */
export interface DeviceHints {
	userAgent: string;
	platform: string;
	maxTouchPoints: number;
}

/** Whether a drag would dismiss native full screen here — true only on an iPhone or iPad. */
export const dismissesFullscreenOnDrag = ({ userAgent, platform, maxTouchPoints }: DeviceHints): boolean =>
	/iPad|iPhone|iPod/.test(userAgent) ||
	// iPadOS reports itself as a Mac; a Mac never has touch points, so this only matches an iPad.
	(platform === 'MacIntel' && maxTouchPoints > 1);
