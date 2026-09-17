import { getContext, setContext } from 'svelte';
import { createPendingWork, type PendingSink } from './pending-work';

/*
 * The app shell owns one pending-work store per tab and hands it down through context, so any
 * page can report that it is waiting for something and the shell's activity bar shows it —
 * without the page having to find room for an indicator of its own (docs/05 §5.7).
 *
 * Context rather than a module singleton, for the same reason the removals store uses it: on
 * the server a module is shared by every request.
 */

const CONTEXT_KEY = Symbol('pending-work');

/** What a page gets from context: somewhere to report to, and a reactive `busy`. */
export interface Pending extends PendingSink {
	/** Reactive — reading it inside `$derived` tracks whether anything is in flight. */
	readonly busy: boolean;
}

/** Creates the store for this tab and puts it in context. Call once, from the app shell. */
export function providePending(): Pending {
	const store = createPendingWork({ scheduler: globalThis });
	let busy = $state(store.busy());
	store.subscribe(() => (busy = store.busy()));

	const pending: Pending = {
		get busy() {
			return busy;
		},
		begin: store.begin,
		end: store.end
	};
	setContext(CONTEXT_KEY, pending);
	return pending;
}

/** The store provided by the app shell; throws outside it so a misplaced use fails loud. */
export function usePending(): Pending {
	const pending = getContext<Pending | undefined>(CONTEXT_KEY);
	if (!pending) throw new Error('usePending() called outside the app shell that provides it');
	return pending;
}
