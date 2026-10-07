/*
 * How something opens and closes in place (docs/05 §5.11): one glide for a height, one fade for
 * what appears or goes, one easing for both. Pure, so the timing is tested without a browser;
 * `motion.svelte.ts` is the adapter that moves the DOM by it, and `Reveal.svelte` the component
 * most places use.
 *
 * Two shapes cover every place:
 * - a *reveal*: one block appears or goes — its height grows from nothing while it fades in, and
 *   shrinks back while it fades out (`revealFrame`);
 * - a *glide*: a box whose content changes under it — two alternatives crossfading, or a list
 *   unfolding — glides from the height on screen to the height of what is there now
 *   (`glidePlan`), so the reader never sees a jump.
 */

import { MOTION } from '../design/tokens';

/**
 * The easing function for a CSS `cubic-bezier(x1, y1, x2, y2)`, for motion that is computed in
 * script (Svelte transitions sample it per frame) rather than handed to the browser. Solved by
 * Newton's method on the curve's x, with bisection as the fallback where the slope is flat.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
	const ax = 3 * x1 - 3 * x2 + 1;
	const bx = 3 * x2 - 6 * x1;
	const cx = 3 * x1;
	const ay = 3 * y1 - 3 * y2 + 1;
	const by = 3 * y2 - 6 * y1;
	const cy = 3 * y1;
	const curveX = (s: number) => ((ax * s + bx) * s + cx) * s;
	const curveY = (s: number) => ((ay * s + by) * s + cy) * s;
	const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;

	const PRECISION = 1e-7;
	function parameterFor(x: number): number {
		let s = x;
		for (let i = 0; i < 8; i++) {
			const error = curveX(s) - x;
			if (Math.abs(error) < PRECISION) return s;
			const slope = slopeX(s);
			if (Math.abs(slope) < 1e-6) break;
			s -= error / slope;
		}
		let low = 0;
		let high = 1;
		s = x;
		while (high - low > PRECISION) {
			if (curveX(s) < x) low = s;
			else high = s;
			s = (low + high) / 2;
		}
		return s;
	}

	return (x: number) => {
		if (x <= 0) return 0;
		if (x >= 1) return 1;
		return curveY(parameterFor(x));
	};
}

function parseCubicBezier(css: string): [number, number, number, number] {
	const numbers = /^cubic-bezier\(([^)]*)\)$/.exec(css)?.[1].split(',').map(Number);
	if (numbers?.length !== 4 || numbers.some(Number.isNaN)) {
		throw new Error(`MOTION.easing is not a cubic-bezier(): ${css}`);
	}
	return [numbers[0], numbers[1], numbers[2], numbers[3]];
}

/** `--ease-standard`, as a function of progress. */
export const standardEasing = cubicBezier(...parseCubicBezier(MOTION.easing));

/** One frame of a reveal: the share of the block's height shown, and its opacity. */
export interface RevealFrame {
	height: number;
	opacity: number;
}

/**
 * The frame at `position` — the eased share of the way open, 0 closed … 1 open. The transition
 * eases time with `standardEasing` before it gets here, so opening and closing both start quick
 * and land gently, and a reversal mid-way starts from the height on screen. The height follows
 * the position; the content has faded in by the time `MOTION.fadeMs` has passed, so it reads
 * well before the box has finished growing, and on the way out it fades as the box shrinks.
 */
export function revealFrame(position: number): RevealFrame {
	return { height: position, opacity: Math.min(1, position / FADED_IN_AT) };
}

/** The eased position the box has reached when the fade time is up. */
const FADED_IN_AT = standardEasing(MOTION.fadeMs / MOTION.expandMs);

/** A height glide the adapter hands to the browser. */
export interface GlidePlan {
	from: number;
	to: number;
	durationMs: number;
	easing: string;
}

/** Less than a pixel is not a change anybody sees, only a shimmer. */
const SMALLEST_GLIDE_PX = 1;

/**
 * How a box gets from the height on screen (`from` — mid-glide, if a glide was under way) to the
 * height its content takes now (`to`). `null` when there is nothing to glide: no change worth
 * drawing, or a reader who asked for less motion, who gets the new height at once.
 */
export function glidePlan(input: {
	from: number;
	to: number;
	reducedMotion: boolean;
}): GlidePlan | null {
	if (input.reducedMotion || Math.abs(input.to - input.from) < SMALLEST_GLIDE_PX) return null;
	return { from: input.from, to: input.to, durationMs: MOTION.expandMs, easing: MOTION.easing };
}

/** How long a reveal takes; with reduced motion the switch is instant. */
export function expandMs(reducedMotion: boolean): number {
	return reducedMotion ? 0 : MOTION.expandMs;
}

/** How long a crossfade takes; with reduced motion the switch is instant. */
export function fadeMs(reducedMotion: boolean): number {
	return reducedMotion ? 0 : MOTION.fadeMs;
}

/** How the page moves to keep something in view: smoothly, or at once with reduced motion. */
export function scrollBehavior(reducedMotion: boolean): ScrollBehavior {
	return reducedMotion ? 'auto' : 'smooth';
}

/**
 * A block that appears in a flex column or a grid also brings the gap beside it, and the gap
 * cannot be animated — it would arrive whole on the first frame and leave whole on the last, a
 * jump on either end. So the closed block wears a negative margin that cancels it: on the side
 * where the gap is, which is above it unless it is the first of its siblings.
 */
export function gapToTakeUp(input: {
	gap: number;
	siblingBefore: boolean;
	siblingAfter: boolean;
}): { top: number; bottom: number } {
	if (input.gap === 0) return { top: 0, bottom: 0 };
	if (input.siblingBefore) return { top: -input.gap, bottom: 0 };
	if (input.siblingAfter) return { top: 0, bottom: -input.gap };
	return { top: 0, bottom: 0 };
}

/**
 * Whether opening a form glides its card to the top of the view (docs/05 §5.11). A form opens
 * under its card's header and grows downwards, so the card holds still while its top is in the
 * upper half of the view — there is room for the form, and a jump would only unsettle the
 * reader. A top lower than that, under the bar, or off screen would leave the form below the
 * fold or out of sight, so the page glides the card's top to just under the bar.
 */
export function glideToOpenedForm(input: {
	cardTop: number;
	viewTop: number;
	viewBottom: number;
}): boolean {
	const middle = (input.viewTop + input.viewBottom) / 2;
	return input.cardTop < input.viewTop || input.cardTop > middle;
}
