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

/** The lifecycle callbacks a case does not care about. */
const noCallbacks = () => ({ onSending: () => {}, onCommitted: () => {}, onFailed: () => {} });

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
		heldAnswer({ holder, fetch }, { key: 'suggestion:parent|a b', label: 'Declined', ...noCallbacks() })(event as any);

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
		heldAnswer({ holder, fetch }, { key: 'k', label: 'Added', ...noCallbacks(), onCommitted: () => (committed += 1) })(event as any);
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
		heldAnswer({ holder, fetch }, { key: 'k', label: 'Declined', ...noCallbacks(), onCommitted: () => (committed += 1) })(event as any);

		await expect(held[0]!.commit()).rejects.toThrow();
		expect(committed).toBe(0);
	});

	/*
	 * The order the screen depends on, and the one defect this file exists to keep out. The
	 * store stops calling a removal pending the moment the window closes, which is *before* the
	 * request it triggers comes back — so between those two moments the list has nothing to tell
	 * an answer in flight from one that was taken back. It read it as taken back: the answered
	 * row reappeared as an open question while its write was on its way, and stayed wrong until
	 * the page was reloaded. So the sending mark must be set before anything is awaited.
	 */
	it('says the answer is on its way before it awaits the request', async () => {
		const { holder, held } = recordingHolder();
		let release = () => {};
		const inFlight = new Promise<Response>((resolve) => {
			release = () => resolve({ ok: true, status: 200, json: async () => ({ type: 'success' }) } as Response);
		});
		const order: string[] = [];
		const { event } = submitEvent('/x?/dismissSuggestion', {});

		heldAnswer(
			{ holder, fetch: () => inFlight },
			{
				key: 'k',
				label: 'Declined',
				onSending: () => void order.push('sending'),
				onCommitted: () => void order.push('committed'),
				onFailed: () => void order.push('failed')
			}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the enhance event shape
		)(event as any);

		const commit = held[0]!.commit();
		// Nothing awaited yet: the mark is already set, so no observer can mistake this for an undo.
		expect(order).toEqual(['sending']);
		release();
		await commit;
		expect(order).toEqual(['sending', 'committed']);
	});

	it('puts the claim back where the list can see it when the send failed', async () => {
		const { holder, held } = recordingHolder();
		const { fetch } = fakeFetch({ ok: false });
		const order: string[] = [];
		const { event } = submitEvent('/x?/dismissSuggestion', {});

		heldAnswer(
			{ holder, fetch },
			{
				key: 'k',
				label: 'Declined',
				onSending: () => void order.push('sending'),
				onCommitted: () => void order.push('committed'),
				onFailed: () => void order.push('failed')
			}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the enhance event shape
		)(event as any);

		await expect(held[0]!.commit()).rejects.toThrow();
		expect(order).toEqual(['sending', 'failed']);
	});
});
