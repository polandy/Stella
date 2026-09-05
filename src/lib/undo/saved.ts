import type { SubmitFunction } from '@sveltejs/kit';

/** What a form that saved says in the toast region. */
export const SAVED_NOTICE = 'Saved';

/** The one thing this needs from the removals store, so the rule is testable without it. */
interface Notifier {
	notify(text: string): void;
}

/**
 * `use:enhance={savedEnhance(removals, close)}` — applies the result the way the default
 * enhance does, then says *Saved* and runs `onSaved` if it worked. A failure stays silent:
 * the section that submitted shows the error itself, and a toast would only repeat it
 * (docs/05 §5.7). Enhancing these forms is what keeps a save from reloading the page, which
 * would end the undo window of anything still on its way out.
 */
export function savedEnhance(notifier: Notifier, onSaved?: () => void): SubmitFunction {
	return () =>
		async ({ result, update }) => {
			await update();
			if (result.type !== 'success' && result.type !== 'redirect') return;
			notifier.notify(SAVED_NOTICE);
			// The section that submitted closes itself; a form that failed stays open with its error.
			onSaved?.();
		};
}
