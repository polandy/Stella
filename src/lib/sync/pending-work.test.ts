import { describe, expect, it } from 'bun:test';
import { createPendingWork } from './pending-work';

describe('createPendingWork', () => {
	it('is idle until something begins, and idle again when it ends', () => {
		const work = createPendingWork();
		expect(work.busy()).toBe(false);

		work.begin();
		expect(work.busy()).toBe(true);

		work.end();
		expect(work.busy()).toBe(false);
	});

	it('stays busy until the last of several overlapping pieces of work has ended', () => {
		const work = createPendingWork();
		work.begin();
		work.begin();

		work.end();
		expect(work.busy()).toBe(true);

		work.end();
		expect(work.busy()).toBe(false);
	});

	it('tells its listeners when it becomes busy and when it falls idle, and not in between', () => {
		const work = createPendingWork();
		const seen: boolean[] = [];
		work.subscribe(() => seen.push(work.busy()));

		work.begin();
		work.begin();
		work.end();
		work.end();

		expect(seen).toEqual([true, false]);
	});

	it('stops telling a listener that has unsubscribed', () => {
		const work = createPendingWork();
		const seen: boolean[] = [];
		const stop = work.subscribe(() => seen.push(work.busy()));

		work.begin();
		stop();
		work.end();
		work.begin();

		expect(seen).toEqual([true]);
	});

	it('refuses to end work that never began, rather than counting below idle', () => {
		const work = createPendingWork();

		expect(() => work.end()).toThrow('nothing was pending');
		expect(work.busy()).toBe(false);
	});
});
