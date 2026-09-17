import type { SubmitFunction } from '@sveltejs/kit';

/*
 * Work the page is waiting for, counted (docs/05 §5.7).
 *
 * Saving a relationship reloads the person's graph, and on a large household that reload is
 * long enough to look like nothing happened. The rule is here, framework-free and counted
 * rather than boolean, so two saves that overlap cannot let the first one's answer clear the
 * second one's badge; the page owns the count and draws whatever it likes from it.
 */

/** Somewhere that keeps the count — the page's own reactive state at the edge. */
export interface PendingSink {
	begin(): void;
	end(): void;
}

/** Runs `work` while the sink counts it. The count ends even when the work fails. */
export async function whilePending<T>(sink: PendingSink, work: () => Promise<T>): Promise<T> {
	sink.begin();
	try {
		return await work();
	} finally {
		sink.end();
	}
}

/**
 * `use:enhance={trackPending(sink, savedEnhance(…))}` — counts a submission from the moment it
 * leaves the form until the wrapped function has applied its result, which for an enhanced form
 * is when the reload it triggered has landed.
 *
 * A wrapped function that returns nothing leaves applying the result to enhance; this always
 * returns a callback, so it applies the result itself in that case — otherwise wrapping a form
 * would quietly stop it from updating.
 */
export function trackPending(sink: PendingSink, inner: SubmitFunction): SubmitFunction {
	return (input) => {
		sink.begin();
		const applyResult = inner(input);
		return async (options) => {
			try {
				const callback = await applyResult;
				if (callback) await callback(options);
				else await options.update();
			} finally {
				sink.end();
			}
		};
	};
}
