import type { ActionReturn } from 'svelte/action';
import { prefersReducedMotion } from 'svelte/motion';
import type { TransitionConfig } from 'svelte/transition';
import {
	expandMs,
	fadeMs,
	gapToTakeUp,
	glidePlan,
	glideToOpenedForm,
	revealFrame,
	scrollTopToShow,
	scrollBehavior,
	standardEasing
} from './motion';

/*
 * The adapter between the motion rules (`motion.ts`, docs/05 §5.11) and the DOM. It holds the
 * browser APIs — computed styles, the Web Animations API, a ResizeObserver — and decides
 * nothing: every duration and every frame comes from the pure module.
 *
 * - `reveal`, a Svelte transition: one block appears or goes in place (`transition:reveal`).
 * - `glide`, an action: a box whose content changes under it glides between the two heights.
 * - `crossfade`, a Svelte transition: the two alternatives inside a gliding box fade over each
 *   other (`Swap.svelte` pairs the two).
 * - `showOpenedForm` and `settleOpenedForm`: a form that just opened in its card is brought into view
 *   and takes the cursor, one way for every card (Section's add forms, the story card's
 *   composer); `bringCardIntoView` is the same glide without the cursor, for the jump bar.
 */

// Svelte passes the direction to a deferred transition; its types leave the argument out.
type DeferredTransition = (options?: { direction?: 'in' | 'out' | 'both' }) => TransitionConfig;

/*
 * A block on its way out stops answering to the cursor at once, the way removing it used to:
 * marking it `inert` drops it from the tab order and from clicks and pointer events, so a reader
 * cannot tab into, or tap, a control that is already fading away. An element focused inside it
 * keeps focus for a frame even once its ancestor turns inert, so it is blurred explicitly in the
 * same instant — code that asks "did the cursor fall to the page?" right after the change —
 * Section's hand-back to its button — would otherwise read the wrong answer.
 */
function leave(node: HTMLElement) {
	node.inert = true;
	const active = document.activeElement;
	if (active instanceof HTMLElement && node.contains(active)) active.blur();
}

/** The box the reveal grows from nothing to, measured once at rest so a reversal aims true. */
interface Box {
	height: number;
	paddingTop: number;
	paddingBottom: number;
	marginTop: number;
	marginBottom: number;
	borderTop: number;
	borderBottom: number;
	/** The negative margins that cancel the parent's gap while the block is closed. */
	closedMarginTop: number;
	closedMarginBottom: number;
}

/** The row gap the parent puts beside this block, if it lays its children out in a column. */
function parentRowGap(node: HTMLElement): number {
	if (!node.parentElement) return 0;
	const style = getComputedStyle(node.parentElement);
	const column =
		style.display.includes('grid') ||
		(style.display.includes('flex') && style.flexDirection.startsWith('column'));
	return column ? parseFloat(style.rowGap) || 0 : 0;
}

function measure(node: HTMLElement): Box {
	const style = getComputedStyle(node);
	const px = (value: string) => parseFloat(value) || 0;
	const closed = gapToTakeUp({
		gap: parentRowGap(node),
		siblingBefore: node.previousElementSibling !== null,
		siblingAfter: node.nextElementSibling !== null
	});
	return {
		closedMarginTop: closed.top,
		closedMarginBottom: closed.bottom,
		height: px(style.height),
		paddingTop: px(style.paddingTop),
		paddingBottom: px(style.paddingBottom),
		marginTop: px(style.marginTop),
		marginBottom: px(style.marginBottom),
		borderTop: px(style.borderTopWidth),
		borderBottom: px(style.borderBottomWidth)
	};
}

/**
 * One block appearing or going in place: its height grows from nothing while it fades in, and
 * shrinks back while it fades out, so what is below it glides instead of jumping. Reverses from
 * wherever it is when toggled mid-way. `overflow: clip` rather than `hidden` while it moves:
 * a field focused inside the growing block must not scroll the block itself.
 */
export function reveal(node: HTMLElement): DeferredTransition {
	const reduced = prefersReducedMotion.current;
	// Measured now, at rest: once it moves, the computed height is the animated one.
	const box = measure(node);
	return ({ direction } = {}) => {
		if (direction === 'out') leave(node);
		return {
			duration: expandMs(reduced),
			easing: standardEasing,
			css: (t) => {
				const frame = revealFrame(t);
				const of = (px: number) => `${px * frame.height}px`;
				const margin = (open: number, closed: number) =>
					`${open * frame.height + closed * (1 - frame.height)}px`;
				return [
					'overflow: clip',
					`opacity: ${frame.opacity}`,
					`height: ${of(box.height)}`,
					`padding-top: ${of(box.paddingTop)}`,
					`padding-bottom: ${of(box.paddingBottom)}`,
					`margin-top: ${margin(box.marginTop, box.closedMarginTop)}`,
					`margin-bottom: ${margin(box.marginBottom, box.closedMarginBottom)}`,
					`border-top-width: ${of(box.borderTop)}`,
					`border-bottom-width: ${of(box.borderBottom)}`
				].join(';');
			}
		};
	};
}

/** One of two alternatives fading in or out over the other, inside a gliding box. */
export function crossfade(node: HTMLElement): DeferredTransition {
	const reduced = prefersReducedMotion.current;
	return ({ direction } = {}) => {
		if (direction === 'out') leave(node);
		return { duration: fadeMs(reduced), easing: standardEasing, css: (t) => `opacity: ${t}` };
	};
}

export interface GlideOptions {
	/** What the box shows; a change of it is what glides. Anything else that resizes it does not. */
	key: unknown;
	/** The height the box is going to, when its own natural height is not it (`Swap`). */
	target?: () => number;
	/** The glide has arrived — or there was none to make; `grew` says which way it went. */
	onsettled?: (grew: boolean) => void;
}

/**
 * A box whose content changes under it glides from the height on screen to the new one. Only a
 * change of `key` glides: a window resized or a photo loading moves the box the way it always
 * did. The box says where it is in `data-motion` — `moving` or `settled` — which is what a test
 * waits on instead of a duration (docs/08 §8.4.2).
 */
export function glide(node: HTMLElement, options: GlideOptions): ActionReturn<GlideOptions> {
	let key = options.key;
	let current = options;
	let running: Animation | null = null;
	/*
	 * The height last drawn. Kept by a ResizeObserver, which reports after layout and before the
	 * next frame, so when the key changes it still holds the height the reader is looking at.
	 */
	let drawn = node.getBoundingClientRect().height;
	const observer = new ResizeObserver(() => {
		drawn = node.getBoundingClientRect().height;
	});
	observer.observe(node);
	node.dataset.motion = 'settled';

	function settle(grew: boolean) {
		running = null;
		node.style.overflow = '';
		node.dataset.motion = 'settled';
		current.onsettled?.(grew);
	}

	function start() {
		// Mid-glide the box stands at the animated height; that is where the next one starts.
		const from = running ? node.getBoundingClientRect().height : drawn;
		running?.cancel();
		running = null;
		const to = current.target ? current.target() : node.getBoundingClientRect().height;
		const plan = glidePlan({ from, to, reducedMotion: prefersReducedMotion.current });
		if (!plan) {
			settle(to > from);
			return;
		}
		node.dataset.motion = 'moving';
		node.style.overflow = 'clip';
		const animation = node.animate([{ height: `${plan.from}px` }, { height: `${plan.to}px` }], {
			duration: plan.durationMs,
			easing: plan.easing
		});
		running = animation;
		animation.onfinish = () => {
			if (running === animation) settle(plan.to > plan.from);
		};
	}

	return {
		update(next) {
			current = next;
			if (Object.is(next.key, key)) return;
			key = next.key;
			// After the content has changed — the update may run before the blocks inside the box
			// have — and before the frame is drawn.
			queueMicrotask(start);
		},
		destroy() {
			observer.disconnect();
			running?.cancel();
		}
	};
}

/**
 * The band of the scroller a reader can see: under its scroll padding (the person page's sticky
 * jump bar) and above a phone's keyboard. The shell's scroller is `#content`; the window
 * otherwise.
 */
function visibleBand(node: HTMLElement): { viewTop: number; viewBottom: number } {
	const scroller = node.closest<HTMLElement>('#content');
	const keyboardTop = window.visualViewport
		? window.visualViewport.offsetTop + window.visualViewport.height
		: window.innerHeight;
	if (!scroller) return { viewTop: 0, viewBottom: keyboardTop };
	const rect = scroller.getBoundingClientRect();
	const padding = parseFloat(getComputedStyle(scroller).scrollPaddingTop) || 0;
	return { viewTop: rect.top + padding, viewBottom: Math.min(rect.bottom, keyboardTop) };
}

/**
 * Scroll the shell's scroller — and only it — to show `node` (`scrollTopToShow`); smoothly, or at
 * once with reduced motion. Never `scrollIntoView`: it scrolls every scrollable ancestor, and a
 * phone's document, a little taller than the screen while the address bar shows, would carry the
 * sticky bars off its top. Outside the shell the document is the scroller.
 */
export function scrollToShow(node: HTMLElement, block: 'start' | 'nearest') {
	const scroller =
		node.closest<HTMLElement>('#content') ?? document.scrollingElement ?? document.documentElement;
	const rect = node.getBoundingClientRect();
	const top = scrollTopToShow({
		scrollTop: scroller.scrollTop,
		maxScrollTop: scroller.scrollHeight - scroller.clientHeight,
		...visibleBand(node),
		element: {
			top: rect.top,
			bottom: rect.bottom,
			marginTop: parseFloat(getComputedStyle(node).scrollMarginTop) || 0
		},
		block
	});
	if (top === scroller.scrollTop) return;
	scroller.scrollTo({ top, behavior: scrollBehavior(prefersReducedMotion.current) });
}

/** The page glides `card`'s top to just under the bar; at once with reduced motion. */
function glideCardToTop(card: HTMLElement) {
	scrollToShow(card, 'start');
}

/**
 * A form has just opened in `card`: the page glides the card's top to just under the bar when
 * the rule asks for it (`glideToOpenedForm`), and the cursor goes into `field` without a jump of
 * its own. Returns whether the page glided, for `settleOpenedForm`.
 */
export function showOpenedForm(card: HTMLElement, field: HTMLElement | null | undefined): boolean {
	const glides = bringCardIntoView(card);
	field?.focus({ preventScroll: true });
	return glides;
}

/**
 * Bring `card` into view by the rule a form opens by (`glideToOpenedForm`): a card whose top is
 * in the upper half of the view holds still, any other glides its top to just under the bar.
 * The jump bar's links go to their cards this way too. Returns whether the page glided.
 */
export function bringCardIntoView(card: HTMLElement): boolean {
	const glides = glideToOpenedForm({
		cardTop: card.getBoundingClientRect().top,
		...visibleBand(card)
	});
	if (glides) glideCardToTop(card);
	return glides;
}

/**
 * The opened form has grown to its height. A card that glided is glided to the top once more:
 * near the foot of the page the first glide stopped where the page then ended, before the form
 * had made it longer. A card that held still has all of its form brought into view.
 */
export function settleOpenedForm(
	card: HTMLElement | null | undefined,
	form: HTMLElement | null | undefined,
	glided: boolean
): void {
	if (glided) {
		if (card) glideCardToTop(card);
		return;
	}
	if (form) scrollToShow(form, 'nearest');
}
