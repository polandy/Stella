import type { IdGenerator } from '../../id';

/**
 * An id generator that hands out `first` in order, then `id-<n>` for the n-th id — so a test
 * names the ids it asserts on and lets the rest be numbered.
 */
export function sequentialIds(...first: string[]): IdGenerator {
	let handedOut = 0;
	return { next: () => first[handedOut++] ?? `id-${handedOut}` };
}
