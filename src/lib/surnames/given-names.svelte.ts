import { getContext, setContext } from 'svelte';
import { give, namesGiven, release, type Given } from './given-names';

/*
 * The browser half of `given-names.ts`: one store in the app shell, so a name given on People
 * reads the same in ⌘K and on whatever page comes next until the reload brings it from the
 * server (docs/02 §2.2.4.4).
 */

export interface GivenNames {
	/** The last name each person was given and that is not in the page data yet. */
	readonly names: ReadonlyMap<string, string>;
	give(key: string, ids: readonly string[], lastName: string): void;
	release(key: string): void;
}

const CONTEXT_KEY = Symbol('given-names');

/** Call once, from the app shell. */
export function provideGivenNames(): GivenNames {
	let given = $state.raw<Given>({});
	const names = $derived(namesGiven(given));
	const store: GivenNames = {
		get names() {
			return names;
		},
		give: (key, ids, lastName) => (given = give(given, key, ids, lastName)),
		release: (key) => (given = release(given, key))
	};
	setContext(CONTEXT_KEY, store);
	return store;
}

/** The store provided by the app shell; throws outside it so a misplaced use fails loud. */
export function useGivenNames(): GivenNames {
	const store = getContext<GivenNames | undefined>(CONTEXT_KEY);
	if (!store) throw new Error('useGivenNames() called outside the app shell that provides it');
	return store;
}
