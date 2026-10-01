import { describe, expect, it } from 'bun:test';
import { createPendingRemovals, UNDO_WINDOW_MS, type Scheduler } from './pending-removals';

/*
 * Removing with undo (docs/02 §2.23, docs/05 §5.7): a removal is held back for one window
 * and only reaches the server when the window closes or the page is left. Pure, with the
 * timer injected, so every rule about the window is asserted here without waiting for it.
 */

/** A scheduler whose clock only moves when the test says so. */
function fakeScheduler() {
	let now = 0;
	let nextHandle = 1;
	const timers = new Map<number, { at: number; fn: () => void }>();
	const scheduler: Scheduler = {
		setTimeout(fn, ms) {
			const handle = nextHandle++;
			timers.set(handle, { at: now + ms, fn });
			return handle;
		},
		clearTimeout(handle) {
			timers.delete(handle as number);
		}
	};
	return {
		scheduler,
		advance(ms: number) {
			now += ms;
			for (const [handle, timer] of [...timers]) {
				if (timer.at <= now) {
					timers.delete(handle);
					timer.fn();
				}
			}
		},
		get armed() {
			return timers.size;
		}
	};
}

function commitRecorder() {
	const committed: string[] = [];
	return {
		committed,
		commit: (key: string) => async () => {
			committed.push(key);
		}
	};
}

function setup(windowMs = UNDO_WINDOW_MS) {
	const clock = fakeScheduler();
	const errors: string[] = [];
	const store = createPendingRemovals({
		scheduler: clock.scheduler,
		windowMs,
		onCommitFailed: (removal, error) => errors.push(`${removal.key}: ${(error as Error).message}`)
	});
	return { clock, store, errors };
}

describe('createPendingRemovals', () => {
	it('hides the item at once but commits nothing until the window closes', async () => {
		const { clock, store } = setup();
		const { committed, commit } = commitRecorder();

		store.remove({ key: 'journal:a', label: 'Removed entry', commit: commit('journal:a') });

		expect(store.isPending('journal:a')).toBe(true);
		expect(store.snapshot().removals.map((r) => r.key)).toEqual(['journal:a']);
		expect(committed).toEqual([]);

		clock.advance(UNDO_WINDOW_MS - 1);
		expect(committed).toEqual([]);

		clock.advance(1);
		await settled();
		expect(committed).toEqual(['journal:a']);
		expect(store.isPending('journal:a')).toBe(false);
	});

	it('undo within the window cancels the commit for good', async () => {
		const { clock, store } = setup();
		const { committed, commit } = commitRecorder();
		store.remove({ key: 'interaction:b', label: 'Removed interaction', commit: commit('interaction:b') });

		store.undo('interaction:b');

		expect(store.isPending('interaction:b')).toBe(false);
		expect(clock.armed).toBe(0);
		clock.advance(UNDO_WINDOW_MS * 2);
		await settled();
		expect(committed).toEqual([]);
	});

	it('flush commits everything still pending, in the order it was removed', async () => {
		const { clock, store } = setup();
		const { committed, commit } = commitRecorder();
		store.remove({ key: 'a', label: 'Removed', commit: commit('a') });
		store.remove({ key: 'b', label: 'Removed', commit: commit('b') });
		store.undo('a');
		store.remove({ key: 'c', label: 'Removed', commit: commit('c') });

		await store.flush();

		expect(committed).toEqual(['b', 'c']);
		expect(store.snapshot().removals).toEqual([]);
		expect(clock.armed).toBe(0);
	});

	it('two flushes in a row — navigation and pagehide both fire — send each removal once', async () => {
		const { store } = setup();
		const { committed, commit } = commitRecorder();
		let release: () => void = () => {};
		store.remove({ key: 'slow', label: 'Removed', commit: () => new Promise<void>((r) => (release = r)) });
		store.remove({ key: 'b', label: 'Removed', commit: commit('b') });

		const first = store.flush();
		const second = store.flush();
		release();
		await Promise.all([first, second]);

		expect(committed).toEqual(['b']);
	});

	it('ignores a second removal of a key that is already pending, so a double click commits once', async () => {
		const { clock, store } = setup();
		const { committed, commit } = commitRecorder();
		store.remove({ key: 'a', label: 'Removed', commit: commit('a') });
		store.remove({ key: 'a', label: 'Removed', commit: commit('a') });

		clock.advance(UNDO_WINDOW_MS);
		await settled();

		expect(committed).toEqual(['a']);
	});

	it('a commit that fails brings the item back and reports the failure instead of swallowing it', async () => {
		const { clock, store, errors } = setup();
		const seen: string[][] = [];
		store.subscribe(() => seen.push(store.snapshot().removals.map((r) => r.key)));
		store.remove({
			key: 'a',
			label: 'Removed',
			commit: async () => {
				throw new Error('offline');
			}
		});

		clock.advance(UNDO_WINDOW_MS);
		await settled();

		expect(store.isPending('a')).toBe(false);
		expect(errors).toEqual(['a: offline']);
		// the subscriber saw the item go pending and then come back
		expect(seen).toEqual([['a'], []]);
	});

	it('undo of an unknown key is a no-op rather than a crash', () => {
		const { store } = setup();
		expect(() => store.undo('nothing')).not.toThrow();
	});

	it('notices are shown for one window and then dropped', () => {
		const { clock, store } = setup();

		store.notify('Saved');
		expect(store.snapshot().notices.map((n) => n.text)).toEqual(['Saved']);

		clock.advance(UNDO_WINDOW_MS);
		expect(store.snapshot().notices).toEqual([]);
	});
});

/*
 * The window is not a fixed eight seconds for somebody still reading the toast or reaching
 * for its Undo (WCAG 2.2.1): while the toast region is hovered or holds focus, it stands still,
 * and once it is let go the window starts over in full.
 */
describe('holding the window open', () => {
	it('commits nothing while held, however long it is held', async () => {
		const { clock, store } = setup();
		const { committed, commit } = commitRecorder();
		store.remove({ key: 'note:a', label: 'Note removed', commit: commit('note:a') });

		clock.advance(UNDO_WINDOW_MS - 1);
		store.hold();
		clock.advance(UNDO_WINDOW_MS * 10);
		await settled();

		expect(committed).toEqual([]);
		expect(store.isPending('note:a')).toBe(true);
	});

	it('gives a full window again once let go, then commits', async () => {
		const { clock, store } = setup();
		const { committed, commit } = commitRecorder();
		store.remove({ key: 'note:a', label: 'Note removed', commit: commit('note:a') });
		clock.advance(UNDO_WINDOW_MS - 1);
		store.hold();

		store.release();
		clock.advance(UNDO_WINDOW_MS - 1);
		await settled();
		expect(committed).toEqual([]);

		clock.advance(1);
		await settled();
		expect(committed).toEqual(['note:a']);
	});

	it('does not start the window of a removal made while held until it is let go', async () => {
		const { clock, store } = setup();
		const { committed, commit } = commitRecorder();
		store.hold();
		store.remove({ key: 'note:b', label: 'Note removed', commit: commit('note:b') });

		clock.advance(UNDO_WINDOW_MS * 2);
		await settled();
		expect(committed).toEqual([]);

		store.release();
		clock.advance(UNDO_WINDOW_MS);
		await settled();
		expect(committed).toEqual(['note:b']);
	});

	it('keeps a notice up while held', () => {
		const { clock, store } = setup();
		store.notify('Saved');
		store.hold();

		clock.advance(UNDO_WINDOW_MS * 2);
		expect(store.snapshot().notices.map((n) => n.text)).toEqual(['Saved']);

		store.release();
		clock.advance(UNDO_WINDOW_MS);
		expect(store.snapshot().notices).toEqual([]);
	});

	it('still lets undo and leaving the page through while held', async () => {
		const { clock, store } = setup();
		const { committed, commit } = commitRecorder();
		store.remove({ key: 'note:a', label: 'Note removed', commit: commit('note:a') });
		store.remove({ key: 'note:b', label: 'Note removed', commit: commit('note:b') });
		store.hold();

		store.undo('note:a');
		await store.flush();

		expect(committed).toEqual(['note:b']);
		// Nothing is left armed behind the flush to fire later.
		store.release();
		clock.advance(UNDO_WINDOW_MS);
		await settled();
		expect(committed).toEqual(['note:b']);
	});

	it('treats a second hold or a stray release as a no-op', async () => {
		const { clock, store } = setup();
		const { committed, commit } = commitRecorder();
		store.remove({ key: 'note:a', label: 'Note removed', commit: commit('note:a') });

		store.release();
		store.hold();
		store.hold();
		store.release();
		expect(clock.armed).toBe(1);

		clock.advance(UNDO_WINDOW_MS);
		await settled();
		expect(committed).toEqual(['note:a']);
	});
});

/** Lets the promise chains started by a fired timer run to completion. */
async function settled() {
	for (let i = 0; i < 4; i++) await Promise.resolve();
}
