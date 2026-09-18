import type { SubmitFunction } from '@sveltejs/kit';
import type { PendingSink } from './pending-work';

/*
 * Reporting work to the shell's pending-work store (`pending-work.ts`, docs/05 §5.7): the three
 * shapes it arrives in — an enhanced form's submit, a plain async job, and the page load a
 * navigation sets off.
 */

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

/**
 * `$effect(() => reportNavigation(sink, navigating.to))` — a page that is still loading is work
 * like any other, counted from the moment the navigation starts until it is over, so a short
 * one stays under the store's own delay instead of flashing the indicator for a frame.
 *
 * `destination` is `navigating.to`, which is null when nothing is on its way. The returned
 * cleanup is what ends the count: Svelte runs it before the effect runs again, which is exactly
 * when the navigation it was counting has finished or been replaced.
 */
export function reportNavigation(sink: PendingSink, destination: unknown): (() => void) | undefined {
	if (!destination) return undefined;
	sink.begin();
	return () => sink.end();
}
