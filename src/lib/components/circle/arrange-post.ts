import { deserialize } from '$app/forms';
import type { ArrangeMode, ArrangePickRef } from '$lib/circles/arrange';
import { ACTION_HEADER } from '$lib/undo/submit-action';

/*
 * The arrange screen's two posts, without the navigation a form would make (docs/02 §2.4.2,
 * ADR-127). An adapter: it holds the fetch and reads the answer, nothing to decide. What the
 * server answered is trusted only as far as the shapes below; the server checks every post again.
 */

/** What an arrangement did, as the toast needs it, with the receipt for *Undo*. */
export interface ArrangedAnswer {
	mode: ArrangeMode;
	targetName: string;
	addedCount: number;
	alreadyThereCount: number;
	/** Opaque to the screen: posted back as it came. */
	change: unknown;
}

/** What taking one back managed. */
export interface UndoneAnswer {
	kept: number;
	conflicts: number;
}

/** The answer of a post: its data, or the refusal in the reader's words. */
export type ArrangePostAnswer<T> = { ok: true; value: T } | { ok: false; message: string | null };

async function post<T>(
	pageId: string,
	action: 'arrange' | 'undo',
	body: FormData,
	key: 'arranged' | 'undone'
): Promise<ArrangePostAnswer<T>> {
	const response = await fetch(`/circles/${pageId}/arrange?/${action}`, {
		method: 'POST',
		body,
		headers: { [ACTION_HEADER]: 'true' }
	});
	const result = deserialize(await response.text());
	if (result.type === 'success') {
		const value = (result.data as Record<string, unknown> | undefined)?.[key];
		return value ? { ok: true, value: value as T } : { ok: false, message: null };
	}
	if (result.type === 'failure') {
		const message = (result.data as { arrangeError?: unknown } | undefined)?.arrangeError;
		return { ok: false, message: typeof message === 'string' ? message : null };
	}
	return { ok: false, message: null };
}

/** Posts one batch: `picks` to `targetId`, moved or copied. */
export function postArrange(
	pageId: string,
	mode: ArrangeMode,
	targetId: string,
	picks: readonly ArrangePickRef[]
): Promise<ArrangePostAnswer<ArrangedAnswer>> {
	const body = new FormData();
	body.set('mode', mode);
	body.set('target', targetId);
	body.set('picks', JSON.stringify(picks));
	return post(pageId, 'arrange', body, 'arranged');
}

/** Posts the receipt of an arrangement back, to take it back. */
export function postUndo(
	pageId: string,
	change: unknown
): Promise<ArrangePostAnswer<UndoneAnswer>> {
	const body = new FormData();
	body.set('change', JSON.stringify(change));
	return post(pageId, 'undo', body, 'undone');
}
