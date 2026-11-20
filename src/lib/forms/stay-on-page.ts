import type { SubmitFunction } from '$app/forms';

type Shape = Record<string, unknown> | undefined;

/**
 * Applies an action's answer to the page it was sent from, as SvelteKit 2 did: Kit 3 would
 * navigate to the action's URL, dropping the page's query (`?check`) or leaving for another route.
 * A redirect is still followed.
 */
export function stayOnPage<Success extends Shape, Failure extends Shape>(
	submit?: SubmitFunction<Success, Failure>
): SubmitFunction<Success, Failure> {
	return async (input) => {
		const after = await submit?.(input);
		return (opts) => {
			const update: typeof opts.update = (options) => opts.update({ navigate: false, ...options });
			return after ? after({ ...opts, update }) : update();
		};
	};
}
