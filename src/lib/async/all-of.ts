/*
 * `Promise.all` over a record rather than a list. With a list, every result is matched to its
 * question by position, and a page that reads many things at once breaks silently the day one
 * is added in the wrong place; here each result keeps the name it was asked for.
 */

type Settled<T extends Record<string, Promise<unknown>>> = { [K in keyof T]: Awaited<T[K]> };

/** Every promise in `promises`, settled together, each result under its own name. */
export async function allOf<T extends Record<string, Promise<unknown>>>(
	promises: T
): Promise<Settled<T>> {
	const names = Object.keys(promises) as (keyof T)[];
	const results = await Promise.all(names.map((name) => promises[name]));
	return Object.fromEntries(names.map((name, index) => [name, results[index]])) as Settled<T>;
}
