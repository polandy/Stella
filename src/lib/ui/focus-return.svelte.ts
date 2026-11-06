import { tick } from 'svelte';
import { focusDestination } from './focus-destination';
import { focusLeftForm, owesFocusBack } from './focus-return';

/*
 * The browser adapter of `focus-return.ts` for a form that opens in place of a button: it
 * remembers whether the cursor was in the form, and once the form closes hands focus back to
 * the button the form came from (WCAG 2.4.3). Tracked from the form's own focus events,
 * because by the time it has closed the field is gone and there is nothing left to ask.
 *
 * `<form onfocusin={back.focusin} onfocusout={back.focusout}>`, then `back.follow(open)` in an
 * `$effect`, or `back.closed()` from an effect that already knows the form just closed.
 */
export class FocusReturn {
	#focusInForm = false;
	#wasOpen = false;
	readonly #target: () => HTMLElement | null | undefined;

	/** `target` is read only once the form has closed, so a bound button may come later. */
	constructor(target: () => HTMLElement | null | undefined) {
		this.#target = target;
	}

	readonly focusin = (): void => {
		this.#focusInForm = true;
	};

	readonly focusout = (event: FocusEvent): void => {
		const form = event.currentTarget;
		if (!(form instanceof Element)) return;
		if (focusLeftForm(focusDestination(form, event.relatedTarget))) this.#focusInForm = false;
	};

	/** Call from an `$effect` with whether the form is open now; acts on the closing only. */
	follow(open: boolean): void {
		const justClosed = this.#wasOpen && !open;
		this.#wasOpen = open;
		if (justClosed) this.closed();
	}

	/** The form has just closed: focus goes back, unless the reader already put it elsewhere. */
	closed(): void {
		const hadFocusInside = this.#focusInForm;
		this.#focusInForm = false;
		void tick().then(() => {
			const active = document.activeElement;
			const focusNow = active === null || active === document.body ? 'page' : 'elsewhere';
			if (owesFocusBack({ hadFocusInside, focusNow })) this.#target()?.focus();
		});
	}
}
