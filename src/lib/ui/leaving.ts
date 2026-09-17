import { cubicOut } from 'svelte/easing';
import { placeAfter, scrollingAncestor } from './keep-place';

/*
 * How an answered row leaves a list (docs/02 §2.4.1, docs/05 §5.4,
 * docs/concepts/relationship-answer-vanish.html).
 *
 * It goes at once rather than standing there answered: fading as it closes, over a fifth of a
 * second. Frame by frame, the list gives back to its own scroll offset exactly the height it
 * just lost, so the rows below hold still while the page grows shorter above them — not one
 * correction at the end, which would slide them up and then snap them back down.
 */

/** How long the row takes to go. Measured against the alternatives, not chosen by feel. */
export const LEAVE_MS = 200;

/**
 * The share of that time the row spends fading. It finishes well before the height does, so the
 * eye reads *gone* first and *shorter list* second, which is the soft part of the effect.
 */
const FADE_SHARE = 0.45;

/** What the transition needs from a row, so its arithmetic can be checked without a browser. */
export interface LeavingBox {
	height: number;
	paddingTop: number;
	paddingBottom: number;
	marginBottom: number;
	borderWidth: number;
}

/** The styles a row carries at progress `t`, where 1 is untouched and 0 is gone. */
export function leavingStyle(box: LeavingBox, t: number): string {
	const fade = Math.min(1, t / FADE_SHARE);
	return [
		'overflow: hidden',
		`opacity: ${fade}`,
		`height: ${t * box.height}px`,
		`padding-top: ${t * box.paddingTop}px`,
		`padding-bottom: ${t * box.paddingBottom}px`,
		`margin-bottom: ${t * box.marginBottom}px`,
		`border-width: ${t * box.borderWidth}px`
	].join('; ');
}

/** Reads a row's box the way the browser resolved it, before it starts to close. */
function boxOf(node: HTMLElement): LeavingBox {
	const style = getComputedStyle(node);
	const px = (value: string) => parseFloat(value) || 0;
	return {
		height: node.getBoundingClientRect().height,
		paddingTop: px(style.paddingTop),
		paddingBottom: px(style.paddingBottom),
		marginBottom: px(style.marginBottom),
		borderWidth: px(style.borderTopWidth)
	};
}

/**
 * `transition:leaving` — the row closes and fades while the list keeps the reader's place.
 *
 * `duration: 0` (under `prefers-reduced-motion`) means the row simply goes, and the scroll
 * offset is corrected in one step, because there is no movement to stay in step with.
 */
export function leaving(node: HTMLElement, { duration = LEAVE_MS }: { duration?: number } = {}) {
	const box = boxOf(node);
	const scroller = scrollingAncestor(node as unknown as Parameters<typeof scrollingAncestor>[0]);
	const element = scroller as unknown as HTMLElement | null;
	let lastHeight = element?.scrollHeight ?? 0;
	// The offset this transition is aiming for, carried rather than read back: at the end of a
	// list the browser shortens `scrollTop` by itself as the content shrinks, and reading that
	// adjusted value and subtracting again gave the same pixels back twice.
	let aim = element?.scrollTop ?? 0;

	return {
		duration,
		easing: cubicOut,
		css: (t: number) => leavingStyle(box, t),
		tick: () => {
			if (!element) return;
			/*
			 * Give back exactly what the list just lost, read from the list itself rather than
			 * worked out from the row's box. Measured: a row's own height and the space it takes
			 * in the list are not the same number — the last row in a group takes no gap with it —
			 * and computing it handed back 8px too many, which moved the rows below the other way.
			 */
			const height = element.scrollHeight;
			const lost = lastHeight - height;
			// Always follow the list, even when it did not shrink this frame: holding on to a
			// stale height would count the same pixels again on the next one.
			lastHeight = height;
			if (lost <= 0) return;
			aim -= lost;
			element.scrollTop = placeAfter(aim, 0, height - element.clientHeight);
		}
	};
}
