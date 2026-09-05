/** The subset of `fetch` the deferred submit needs; injected so it can be faked. */
export type ActionFetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Thrown when the action did not remove the item — the caller brings it back on screen. */
export class ActionFailedError extends Error {
	constructor(action: string, status: number) {
		super(`${action} answered ${status}`);
		this.name = 'ActionFailedError';
	}
}

/** The header SvelteKit reads to answer a form action with a JSON result instead of a page. */
const ACTION_HEADER = 'x-sveltekit-action';

/**
 * Sends `body` to a form action the way the browser would have, minus the navigation.
 * `keepalive` lets the request finish after the page is left, which is when a deferred
 * removal is most often sent (docs/04 §4.9).
 */
export async function submitAction(fetch: ActionFetch, action: string, body: FormData): Promise<void> {
	const response = await fetch(action, {
		method: 'POST',
		body,
		keepalive: true,
		headers: { [ACTION_HEADER]: 'true' }
	});
	if (!response.ok) throw new ActionFailedError(action, response.status);
	const result = (await response.json()) as { type?: string; status?: number };
	if (result.type === 'success' || result.type === 'redirect') return;
	throw new ActionFailedError(action, result.status ?? response.status);
}
