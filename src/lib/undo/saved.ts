import type { SubmitFunction } from '@sveltejs/kit';

/** The one thing this needs from the removals store, so the rule is testable without it. */
interface Notifier {
	notify(text: string): void;
}

/**
 * `use:enhance={savedEnhance(removals, t('components.saved'), close)}` — applies the result
 * the way the default enhance does, then says *Saved* — in the viewer's language, which is
 * why the wording is passed in rather than living here — and runs `onSaved` if it worked. A failure stays silent:
 * the section that submitted shows the error itself, and a toast would only repeat it
 * (docs/05 §5.7). Enhancing these forms is what keeps a save from reloading the page, which
 * would end the undo window of anything still on its way out.
 */
export function savedEnhance(
	notifier: Notifier,
	savedNotice: string,
	onSaved?: () => void
): SubmitFunction {
	return () =>
		async ({ result, update }) => {
			await update();
			if (result.type !== 'success' && result.type !== 'redirect') return;
			notifier.notify(savedNotice);
			// The section that submitted closes itself; a form that failed stays open with its error.
			onSaved?.();
		};
}
