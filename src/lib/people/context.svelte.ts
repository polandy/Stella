import { getContext, setContext } from 'svelte';
import type { PersonContext } from './context';

/*
 * The app shell loads, once per navigation, what the viewer may see of the relationships and
 * circles of people with nothing typed to tell them apart (docs/02 §2.2.3), and hands it down
 * through context: every picker that tells namesakes apart reads the same map, whichever page's
 * list of people it was given.
 */

const CONTEXT_KEY = Symbol('people-context');

type Read = () => Record<string, PersonContext> | undefined;

/** Puts the shell's context in reach of every picker below it. Call once, from the app shell. */
export function providePeopleContext(read: Read): void {
	setContext(CONTEXT_KEY, read);
}

/** The context by person id, reactive when read inside `$derived`; empty outside the shell. */
export function usePeopleContext(): () => ReadonlyMap<string, PersonContext> {
	const read = getContext<Read | undefined>(CONTEXT_KEY);
	return () => new Map(Object.entries(read?.() ?? {}));
}
