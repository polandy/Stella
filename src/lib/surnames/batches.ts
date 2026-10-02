/*
 * Last names held for one undo window before they are sent (docs/concepts/surnames.md §7,
 * docs/02 §2.23). Pure: the screen keeps a `Batches` value and asks it which people to leave
 * out of its lists. Undo is pressed in the toast, which knows nothing of the list, so the way
 * back is observed: a batch the removals store no longer holds, and that never got as far as
 * sending, was taken back.
 */

type BatchState = 'held' | 'sending' | 'sent';

interface Batch {
	ids: readonly string[];
	state: BatchState;
}

/** Every batch of this visit, by the key it is held under in the removals store. */
export type Batches = Readonly<Record<string, Batch>>;

/** A batch has been handed to the undo window. */
export function held(batches: Batches, key: string, ids: readonly string[]): Batches {
	return { ...batches, [key]: { ids, state: 'held' } };
}

/** The window closed and the request is going out. */
export function sending(batches: Batches, key: string): Batches {
	const batch = batches[key];
	return batch ? { ...batches, [key]: { ...batch, state: 'sending' } } : batches;
}

/** The request came back: a sent batch stays hidden, a failed one brings its people back. */
export function settle(batches: Batches, key: string, outcome: 'sent' | 'failed'): Batches {
	const batch = batches[key];
	if (!batch) return batches;
	if (outcome === 'sent') return { ...batches, [key]: { ...batch, state: 'sent' } };
	const rest = { ...batches };
	delete rest[key];
	return rest;
}

/** Drops the batches the store no longer holds and that were never sent: Undo was pressed. */
export function takenBack(batches: Batches, isPending: (key: string) => boolean): Batches {
	const kept = Object.entries(batches).filter(([key, batch]) => batch.state !== 'held' || isPending(key));
	return kept.length === Object.keys(batches).length ? batches : Object.fromEntries(kept);
}

/** Everyone a batch of this visit names, while it is held, on its way, or sent. */
export function hiddenIds(batches: Batches): ReadonlySet<string> {
	return new Set(Object.values(batches).flatMap((batch) => batch.ids));
}
