import type { SubmitFunction } from '@sveltejs/kit';
import { submitAction, type ActionFetch } from './submit-action';

/*
 * Answering a suggestion without leaving the page (docs/02 §2.4.1, §2.23).
 *
 * `savedEnhance` submits and then reports; this one does not submit at all. The answer is
 * handed to the removals store, which holds it for one undo window and sends it when the
 * window closes — so *Undo* costs no request, and nothing is written for a mis-tap.
 *
 * The form is left exactly as it was, which is what keeps the screen working with JavaScript
 * off: without this the same form posts to the same action and the page reloads.
 */

/** The one thing this needs from the removals store, so the rule is testable without it. */
export interface Holder {
	remove(removal: { key: string; label: string; commit: () => Promise<void> }): void;
}

export interface HeldAnswerDeps {
	holder: Holder;
	/** Injected so a test can answer without a network. */
	fetch: ActionFetch;
}

export interface HeldAnswer {
	/** The claim's identity, so the same claim reached twice is held once. */
	key: string;
	/** What the toast says while the window is open. */
	label: string;
	/** The window closed and the answer went through: the row may leave for good. */
	onCommitted: () => void;
}

/**
 * `use:enhance={heldAnswer(deps, answer)}` — cancels the submit, hands the answer to the undo
 * window, and sends it only once that window closes. A failed send is the store's business: it
 * puts the row back and says so, which is why nothing is reported here.
 */
export function heldAnswer(deps: HeldAnswerDeps, answer: HeldAnswer): SubmitFunction {
	return ({ action, formData, cancel }) => {
		// Nothing is posted now. From here the window owns this answer.
		cancel();
		deps.holder.remove({
			key: answer.key,
			label: answer.label,
			commit: async () => {
				await submitAction(deps.fetch, `${action.pathname}${action.search}`, formData);
				answer.onCommitted();
			}
		});
	};
}
