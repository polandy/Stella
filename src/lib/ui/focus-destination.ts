import type { FocusDestination } from './focus-return';

/**
 * Reads where a `focusout` from inside `form` sent focus, for `focusLeftForm` to judge. The
 * browser adapter of `focus-return.ts`: it looks at the page and decides nothing.
 */
export function focusDestination(form: Element, next: EventTarget | null): FocusDestination {
	if (!(next instanceof Node)) return 'nowhere';
	if (next === document.body) return 'page';
	return form.contains(next) ? 'inside' : 'elsewhere';
}
