import { describe, expect, it } from 'bun:test';
import { ActionFailedError, submitAction, type ActionFetch } from './submit-action';

/*
 * The deferred removal reaches the server as a plain POST to the form action it would have
 * submitted natively. The fetch is injected so the request shape and the reading of
 * SvelteKit's action result are asserted without a server.
 */

function fakeFetch(body: unknown, status = 200) {
	const calls: { url: string; init: RequestInit }[] = [];
	const fetch: ActionFetch = async (url, init) => {
		calls.push({ url: String(url), init: init ?? {} });
		return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
	};
	return { fetch, calls };
}

describe('submitAction', () => {
	it('posts the form data to the action as a SvelteKit action request that survives leaving the page', async () => {
		const { fetch, calls } = fakeFetch({ type: 'redirect', status: 303, location: '/contacts/x' });
		const body = new FormData();
		body.set('id', 'entry-1');

		await submitAction(fetch, '?/removeJournalEntry', body);

		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe('?/removeJournalEntry');
		expect(calls[0].init.method).toBe('POST');
		expect(calls[0].init.body).toBe(body);
		expect(calls[0].init.keepalive).toBe(true);
		expect(new Headers(calls[0].init.headers).get('x-sveltekit-action')).toBe('true');
	});

	it('resolves on a success result too', async () => {
		const { fetch } = fakeFetch({ type: 'success', status: 200 });
		await expect(submitAction(fetch, '?/x', new FormData())).resolves.toBeUndefined();
	});

	it('rejects with the action status when the action answered with a failure', async () => {
		const { fetch } = fakeFetch({ type: 'failure', status: 403 });
		await expect(submitAction(fetch, '?/x', new FormData())).rejects.toThrow(ActionFailedError);
		await expect(submitAction(fetch, '?/x', new FormData())).rejects.toThrow('403');
	});

	it('rejects when the server did not answer with an action result at all', async () => {
		const { fetch } = fakeFetch({}, 500);
		await expect(submitAction(fetch, '?/x', new FormData())).rejects.toThrow(ActionFailedError);
	});
});
