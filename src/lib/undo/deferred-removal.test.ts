import { describe, expect, it } from 'bun:test';
import { deferredRemoval } from './deferred-removal';
import type { ActionFetch } from './submit-action';
import type { PendingSink } from '../sync/pending-work';

/*
 * What a RemoveButton hands to the undo store (docs/02 §2.23, docs/05 §5.7). The rule worth
 * defending is which part of a removal counts as work: the undo window is the reader's own
 * time and nothing is on its way to the server yet, so only the commit — the request plus the
 * reload behind it — is reported to the activity indicator.
 */

/** Writes down everything both sides were told, in one list, so order can be asserted. */
function trail(): { calls: string[]; sink: PendingSink; fetch: ActionFetch; reload: () => Promise<void> } {
	const calls: string[] = [];
	return {
		calls,
		sink: {
			begin: () => void calls.push('begin'),
			end: () => void calls.push('end')
		},
		fetch: async (url) => {
			calls.push(`post ${url}`);
			return new Response(JSON.stringify({ type: 'success', status: 200 }), {
				headers: { 'content-type': 'application/json' }
			});
		},
		reload: async () => void calls.push('reload')
	};
}

const request = (body = new FormData()) => ({
	kind: 'date' as const,
	id: 'date-1',
	label: 'Date removed',
	action: '?/removeDate',
	body
});

describe('deferredRemoval', () => {
	it('names the item the way the list around it does, and says what the toast says', () => {
		const { fetch, reload } = trail();
		const removal = deferredRemoval(request(), { fetch, reload });

		expect(removal.key).toBe('date:date-1');
		expect(removal.label).toBe('Date removed');
	});

	it('reports nothing while the undo window is open', async () => {
		const { calls, sink, fetch, reload } = trail();
		const removal = deferredRemoval(request(), { fetch, reload, pending: sink });

		// Built, held, and offered as Undo — the server has not been told anything yet.
		expect(calls).toEqual([]);

		// The sink is a real one and is heard the moment the window closes, so the silence
		// above is the window being free and not a sink that was never wired up.
		await removal.commit();
		expect(calls).toContain('begin');
	});

	it('counts the removal from the request until the screen behind it has caught up', async () => {
		const { calls, sink, fetch, reload } = trail();

		await deferredRemoval(request(), { fetch, reload, pending: sink }).commit();

		expect(calls).toEqual(['begin', 'post ?/removeDate', 'reload', 'end']);
	});

	it('sends the form data the button carried', async () => {
		const sent: FormData[] = [];
		const body = new FormData();
		body.set('dateId', 'date-1');
		const fetch: ActionFetch = async (_url, init) => {
			sent.push(init?.body as FormData);
			return new Response(JSON.stringify({ type: 'success', status: 200 }), {
				headers: { 'content-type': 'application/json' }
			});
		};

		await deferredRemoval(request(body), { fetch, reload: async () => {} }).commit();

		expect(sent).toEqual([body]);
	});

	it('removes without counting when no section asked to be told', async () => {
		const { calls, fetch, reload } = trail();

		await deferredRemoval(request(), { fetch, reload }).commit();

		expect(calls).toEqual(['post ?/removeDate', 'reload']);
	});

	it('stops counting when the removal fails, and lets the failure through', async () => {
		const { calls, sink, reload } = trail();
		const fetch: ActionFetch = async () => {
			calls.push('post');
			return new Response('nope', { status: 500 });
		};

		const commit = deferredRemoval(request(), { fetch, reload, pending: sink }).commit();

		await expect(commit).rejects.toThrow();
		// The failure must reach the store, which brings the row back — and the count must not
		// be left standing, or the indicator would never go again.
		expect(calls).toEqual(['begin', 'post', 'end']);
	});
});
