import { getContext, setContext } from 'svelte';

/*
 * What the signed-in member's new records start as (docs/02 §2.17). The app shell hands it
 * down so every adding form — the composer, a picker that creates someone inline — opens on
 * the member's choice instead of each one deciding for itself.
 */

type Visibility = 'shared' | 'private';
type Read = () => Visibility;

const CONTEXT_KEY = Symbol('default-visibility');

/** Puts the member's default in reach of every form below. Call once, from the app shell. */
export function provideDefaultVisibility(read: Read): void {
	setContext(CONTEXT_KEY, read);
}

/** The member's default; `shared` outside the shell, where nothing is added. */
export function useDefaultVisibility(): Read {
	const read = getContext<Read | undefined>(CONTEXT_KEY);
	return () => read?.() ?? 'shared';
}
