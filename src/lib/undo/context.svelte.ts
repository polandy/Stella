import { getContext, setContext } from 'svelte';
import { createPendingRemovals, type Removal, type RemovalsSnapshot } from './pending-removals';

/*
 * The app shell owns one removals store per tab and hands it down through context, so a
 * list can hide a pending item and the toast region can offer Undo without either knowing
 * the other. Context rather than a module singleton: on the server a module is shared by
 * every request, and a removal must never leak between them.
 */

const CONTEXT_KEY = Symbol('pending-removals');

/** What a component gets from context; `snapshot` is reactive. */
export interface Removals {
	readonly snapshot: RemovalsSnapshot;
	remove(removal: Removal): void;
	undo(key: string): void;
	flush(): Promise<void>;
	/** Reactive — reading it inside `$derived` tracks the pending list. */
	isPending(key: string): boolean;
	notify(text: string): void;
}

/** What the toast says when a removal did not reach the server. */
const REMOVAL_FAILED_NOTICE = 'Could not remove it. It is back on the page.';

/** Creates the store for this tab and puts it in context. Call once, from the app shell. */
export function provideRemovals(): Removals {
	const store = createPendingRemovals({
		scheduler: globalThis,
		onCommitFailed: () => store.notify(REMOVAL_FAILED_NOTICE)
	});
	let snapshot = $state.raw(store.snapshot());
	store.subscribe(() => (snapshot = store.snapshot()));

	const removals: Removals = {
		get snapshot() {
			return snapshot;
		},
		remove: store.remove,
		undo: store.undo,
		flush: store.flush,
		isPending: (key) => snapshot.removals.some((removal) => removal.key === key),
		notify: store.notify
	};
	setContext(CONTEXT_KEY, removals);
	return removals;
}

/** The store provided by the app shell; throws outside it so a misplaced use fails loud. */
export function useRemovals(): Removals {
	const removals = getContext<Removals | undefined>(CONTEXT_KEY);
	if (!removals) throw new Error('useRemovals() called outside the app shell that provides it');
	return removals;
}
