import { describe, expect, it } from 'bun:test';
import { heldAnswer, type Holder } from './held-answer';

/*
 * Answering a suggestion without leaving the page (docs/02 §2.4.1).
 *
 * Two things have to hold, and both are invisible from the screen: the answer must not be sent
 * when the button is pressed — otherwise *Undo* is undoing a write rather than preventing one —
 * and the row must not be declared gone until the send actually succeeded.
 */

/** A holder that records what it was handed, so a test can run the window by hand. */
function recordingHolder() {
	const held: { key: string; label: string; commit: () => Promise<void> }[] = [];
	const holder: Holder = { remove: (removal) => void held.push(removal) };
	return { holder, held };
}

/** A `fetch` that records its calls and answers the way a form action does. */
function fakeFetch(answer: { ok: boolean; body?: unknown }) {
	const calls: { url: string; body: FormData }[] = [];
	const fetch = async (url: string, init?: RequestInit) => {
		calls.push({ url, body: init!.body as FormData });
		return {
			ok: answer.ok,
			status: answer.ok ? 200 : 500,
			json: async () => answer.body ?? { type: 'success' }
		} as Response;
	};
	return { fetch, calls };
}

const submitEvent = (action: string, body: Record<string, string>) => {
	const formData = new FormData();
	for (const [name, value] of Object.entries(body)) formData.set(name, value);
	let cancelled = false;
	return {
		event: {
			action: new URL(`http://stella.test${action}`),
			formData,
			cancel: () => void (cancelled = true)
		},
		wasCancelled: () => cancelled
	};
};

describe('heldAnswer', () => {
	it('sends nothing when the button is pressed', async () => {
		const { holder, held } = recordingHolder();
		const { fetch, calls } = fakeFetch({ ok: true });
		const { event, wasCancelled } = submitEvent('/settings/relationships?/dismissSuggestion', {
			relation: 'parent'
		});

		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the enhance event shape
		heldAnswer({ holder, fetch }, { key: 'suggestion:parent|a b', label: 'Declined', onCommitted: () => {} })(event as any);

		expect(wasCancelled()).toBe(true);
		// Held, not sent: the positive control is that the removal *was* recorded.
		expect(held).toHaveLength(1);
		expect(held[0]!.key).toBe('suggestion:parent|a b');
		expect(calls).toHaveLength(0);
	});

	it('posts to the same action the form named, once the window closes', async () => {
		const { holder, held } = recordingHolder();
		const { fetch, calls } = fakeFetch({ ok: true });
		let committed = 0;
		const { event } = submitEvent('/settings/relationships?review&after=k&/addProposedRelationship', {
			toId: 'lisa'
		});

		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the enhance event shape
		heldAnswer({ holder, fetch }, { key: 'k', label: 'Added', onCommitted: () => (committed += 1) })(event as any);
		await held[0]!.commit();

		expect(calls).toHaveLength(1);
		expect(calls[0]!.url).toBe('/settings/relationships?review&after=k&/addProposedRelationship');
		expect(calls[0]!.body.get('toId')).toBe('lisa');
		expect(committed).toBe(1);
	});

	/*
	 * The failure path. A contradiction (409) is a real answer, not a glitch — the row has to
	 * come back, so it must never have been declared gone. The store puts it back; this only has
	 * to refrain from saying it left.
	 */
	it('does not call the claim gone when the send failed', async () => {
		const { holder, held } = recordingHolder();
		const { fetch } = fakeFetch({ ok: false });
		let committed = 0;
		const { event } = submitEvent('/x?/dismissSuggestion', {});

		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the enhance event shape
		heldAnswer({ holder, fetch }, { key: 'k', label: 'Declined', onCommitted: () => (committed += 1) })(event as any);

		await expect(held[0]!.commit()).rejects.toThrow();
		expect(committed).toBe(0);
	});
});
