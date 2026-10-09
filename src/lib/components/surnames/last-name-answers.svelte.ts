import type { SubmitFunction } from '@sveltejs/kit';
import { invalidateAll } from '$app/navigation';
import { useTranslate } from '$lib/i18n/context.svelte';
import { useRemovals } from '$lib/undo/context.svelte';
import { submitAction } from '$lib/undo/submit-action';

/*
 * The *Last names* list's two answers (docs/02 §2.2.4.2), as the browser gives them: *Not
 * Brunner* and *No last name* are saved at once — the person moves to their next name or into
 * the drawer while the list reloads — and the toast's *Undo* posts the answer's way back
 * (*Offer again*, *Ask again*). Unlike a name, an answer is not held for the window: it writes
 * nothing anyone would need to take back from someone else's screen.
 */

export interface LastNameAnswers {
	/** `use:enhance` on a form posting `?/dismissLastName` for `person` and that name. */
	dismiss(person: string, name: string): SubmitFunction;
	/** `use:enhance` on a form posting `?/settleWithoutLastName` for `person`. */
	settle(person: string): SubmitFunction;
}

/** Call once from a component's script; it reads the shell's removals store from context. */
export function useLastNameAnswers(): LastNameAnswers {
	const removals = useRemovals();
	const t = useTranslate();

	/** Saves the answer, then offers the action that takes it back under the same fields. */
	function answer(said: string, takeBack: string): SubmitFunction {
		return ({ action, formData }) =>
			async ({ result, update }) => {
				await update();
				if (result.type !== 'success') {
					removals.notify(t('surnames.toast.answerFailed'));
					return;
				}
				removals.notify(said, async () => {
					try {
						await submitAction(fetch, `${action.pathname}?/${takeBack}`, formData);
					} catch {
						removals.notify(t('surnames.toast.answerFailed'));
					}
					await invalidateAll();
				});
			};
	}

	return {
		dismiss: (person, name) =>
			answer(t('surnames.toast.declined', { name, person }), 'restoreLastName'),
		settle: (person) => answer(t('surnames.toast.settled', { person }), 'askAgainForLastName')
	};
}
