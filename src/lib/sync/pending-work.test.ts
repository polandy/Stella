import { describe, expect, it } from 'bun:test';
import {
	createPendingWork,
	MIN_VISIBLE_MS,
	SHOW_AFTER_MS,
	type Scheduler
} from './pending-work';

/*
 * A clock the test moves by hand. Nothing here waits for a real timer, so these tests say what
 * the rule is rather than racing it.
 */
function fakeClock(): Scheduler & { advance(ms: number): void } {
	let now = 0;
	let nextHandle = 1;
	const due = new Map<number, { at: number; fn: () => void }>();
	return {
		setTimeout(fn, ms) {
			const handle = nextHandle++;
			due.set(handle, { at: now + ms, fn });
			return handle;
		},
		clearTimeout(handle) {
			due.delete(handle as number);
		},
		advance(ms) {
			now += ms;
			for (const [handle, timer] of [...due].sort((a, b) => a[1].at - b[1].at)) {
				if (timer.at > now) continue;
				due.delete(handle);
				timer.fn();
			}
		}
	};
}

describe('createPendingWork', () => {
	it('shows nothing for work that is over before the delay', () => {
		const clock = fakeClock();
		const work = createPendingWork({ scheduler: clock });

		work.begin();
		clock.advance(SHOW_AFTER_MS - 1);
		expect(work.busy()).toBe(false);

		work.end();
		clock.advance(SHOW_AFTER_MS * 4);
		expect(work.busy()).toBe(false);
	});

	it('shows the work once it has lasted longer than the delay', () => {
		const clock = fakeClock();
		const work = createPendingWork({ scheduler: clock });

		work.begin();
		clock.advance(SHOW_AFTER_MS);
		expect(work.busy()).toBe(true);
	});

	it('keeps it shown for its minimum once it is up, so it cannot blink', () => {
		const clock = fakeClock();
		const work = createPendingWork({ scheduler: clock });

		work.begin();
		clock.advance(SHOW_AFTER_MS);
		work.end();
		expect(work.busy()).toBe(true);

		clock.advance(MIN_VISIBLE_MS - 1);
		expect(work.busy()).toBe(true);

		clock.advance(1);
		expect(work.busy()).toBe(false);
	});

	it('stays shown while later work is still running', () => {
		const clock = fakeClock();
		const work = createPendingWork({ scheduler: clock });

		work.begin();
		clock.advance(SHOW_AFTER_MS);
		work.begin();
		work.end();
		clock.advance(MIN_VISIBLE_MS * 2);
		expect(work.busy()).toBe(true);

		work.end();
		clock.advance(MIN_VISIBLE_MS);
		expect(work.busy()).toBe(false);
	});

	it('waits out the delay again for the next piece of work', () => {
		const clock = fakeClock();
		const work = createPendingWork({ scheduler: clock });

		work.begin();
		clock.advance(SHOW_AFTER_MS);
		work.end();
		clock.advance(MIN_VISIBLE_MS);
		expect(work.busy()).toBe(false);

		work.begin();
		expect(work.busy()).toBe(false);
		clock.advance(SHOW_AFTER_MS);
		expect(work.busy()).toBe(true);
	});

	it('tells its listeners when it appears and when it goes, and not in between', () => {
		const clock = fakeClock();
		const work = createPendingWork({ scheduler: clock });
		const seen: boolean[] = [];
		work.subscribe(() => seen.push(work.busy()));

		work.begin();
		work.begin();
		clock.advance(SHOW_AFTER_MS);
		work.end();
		work.end();
		clock.advance(MIN_VISIBLE_MS);

		expect(seen).toEqual([true, false]);
	});

	it('stops telling a listener that has unsubscribed', () => {
		const clock = fakeClock();
		const work = createPendingWork({ scheduler: clock });
		const seen: boolean[] = [];
		const stop = work.subscribe(() => seen.push(work.busy()));

		work.begin();
		clock.advance(SHOW_AFTER_MS);
		stop();
		work.end();
		clock.advance(MIN_VISIBLE_MS);

		expect(seen).toEqual([true]);
	});

	it('refuses to end work that never began, rather than counting below idle', () => {
		const clock = fakeClock();
		const work = createPendingWork({ scheduler: clock });

		expect(() => work.end()).toThrow('nothing was pending');
		expect(work.busy()).toBe(false);
	});
});
