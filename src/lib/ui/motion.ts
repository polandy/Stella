/*
 * Less motion, from either place it can be asked for (docs/02 §2.17, docs/05 §5.5): the
 * device's `prefers-reduced-motion`, and the member's own switch in Settings. The switch is
 * written on `<html>` as `data-motion="reduce"` — by the server on the first paint, by the app
 * shell after a change — and `app.css` honours that attribute wherever it honours the media
 * query. Code that animates from script asks `lessMotion()`.
 */

/** The attribute on `<html>` that carries the member's choice. */
export const MOTION_ATTRIBUTE = 'data-motion';

/** The attribute's value for a member's choice. */
export function motionAttribute(reduce: boolean): 'reduce' | 'auto' {
	return reduce ? 'reduce' : 'auto';
}

/** Either source is enough; the switch never brings motion back to a device that asked for less. */
export function wantsLessMotion(state: { device: boolean; attribute: string | undefined | null }): boolean {
	return state.device || state.attribute === 'reduce';
}

/** The browser's answer right now. Only call where `window` exists. */
export function lessMotion(): boolean {
	return wantsLessMotion({
		device: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
		attribute: document.documentElement.getAttribute(MOTION_ATTRIBUTE)
	});
}
