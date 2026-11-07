import { prefersReducedMotion } from 'svelte/motion';
import { glideToOpenedForm, scrollTopToShow, scrollBehavior } from './motion';

/*
 * The adapter that scrolls the shell to show a card or a form (docs/05 §5.11): it measures the
 * DOM and scrolls, the rules come from `motion.ts`. `showOpenedForm` and `settleOpenedForm`: a
 * form that just opened in its card is brought into view and takes the cursor, one way for
 * every card (Section's add forms, the story card's composer); `bringCardIntoView` is the same
 * glide without the cursor, for the jump bar.
 */

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
