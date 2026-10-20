import { deserialize } from '$app/forms';
import { invalidateAll } from '$app/navigation';
import type { Translate } from '$lib/i18n/translate';
import type { Removals } from '$lib/undo/context.svelte';
import { ACTION_HEADER } from '$lib/undo/submit-action';

/*
 * Moving a circle from its page without a form (docs/02 §2.4.2): the sub-circles card's *Add
 * existing* and *Detach*, and every *Undo* of a move. No confirmation step: the move happens, a
 * toast says where the circle is now, and its *Undo* posts the circle back through the same
 * checked action (ADR-126). An adapter — it holds the fetch and the reload, nothing to decide.
 */

/** What a move answered: where the circle was before, or the refusal in the reader's words. */
export type MoveAnswer = { ok: true; from: string | null } | { ok: false; message: string | null };

/** What moving needs from the page it is done on. */
export interface MoveContext {
	/** The circle page whose `?/moveCircle` is posted to. */
	pageId: string;
	removals: Removals;
	t: Translate;
}

/** Posts the move, without the navigation a form would make. */
export async function postMove(
	pageId: string,
	circleId: string,
	parentId: string | null
): Promise<MoveAnswer> {
	const body = new FormData();
	body.set('circle', circleId);
	body.set('parent', parentId ?? '');
	const response = await fetch(`/circles/${pageId}?/moveCircle`, {
		method: 'POST',
		body,
		headers: { [ACTION_HEADER]: 'true' }
	});
	const result = deserialize(await response.text());
	if (result.type === 'success') {
		const move = (result.data as { move?: { from?: unknown } } | undefined)?.move;
		return { ok: true, from: typeof move?.from === 'string' ? move.from : null };
	}
	if (result.type === 'failure') {
		const message = (result.data as { moveError?: unknown } | undefined)?.moveError;
		return { ok: false, message: typeof message === 'string' ? message : null };
	}
	return { ok: false, message: null };
}

/**
 * Says `text` in a toast whose *Undo* puts `circleId` back under `backTo` (null: on its own).
 * The way back is checked again, and a refusal is said in a toast of its own.
 */
export function offerUndo(
	context: MoveContext,
	text: string,
	circleId: string,
	backTo: string | null
): void {
	const { pageId, removals, t } = context;
	removals.notify(text, () => {
		void postMove(pageId, circleId, backTo)
			.then(async (answer) => {
				if (answer.ok) await invalidateAll();
				else removals.notify(answer.message ?? t('circles.sub.undoFailed'));
			})
			.catch((error: unknown) => {
				console.error('Could not take the circle move back:', error);
				removals.notify(t('circles.sub.undoFailed'));
			});
	});
}

/**
 * Moves `circleId` under `parentId` (null: on its own), reloads the page and offers *Undo* in a
 * toast saying `text`. A refusal is said in a toast instead, and nothing moves.
 */
export async function moveWithUndo(
	context: MoveContext,
	circleId: string,
	parentId: string | null,
	text: string
): Promise<void> {
	const { removals, t } = context;
	let answer: MoveAnswer;
	try {
		answer = await postMove(context.pageId, circleId, parentId);
	} catch (error) {
		console.error('Could not move the circle:', error);
		removals.notify(t('errors.form.checkAndRetry'));
		return;
	}
	if (!answer.ok) {
		removals.notify(answer.message ?? t('errors.form.checkAndRetry'));
		return;
	}
	await invalidateAll();
	offerUndo(context, text, circleId, answer.from);
}
