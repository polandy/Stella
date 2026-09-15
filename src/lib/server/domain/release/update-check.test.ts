import { describe, expect, it } from 'bun:test';
import type { Clock } from '../../clock';
import type { LatestRelease, ReleaseFeed } from './feed';
import { CHECK_INTERVAL_MS, createUpdateCheck, RETRY_INTERVAL_MS } from './update-check';

/** A clock the test moves by hand — nothing here waits on wall time. */
function fakeClock(start = 1_000): Clock & { advance(ms: number): void } {
	let now = start;
	return { now: () => now, advance: (ms) => void (now += ms) };
}

/** A request the test holds open, so two callers are provably in flight at once. */
function gate() {
	let open!: () => void;
	const opened = new Promise<void>((resolve) => (open = resolve));
	return { opened, open: () => open() };
}

/**
 * A feed that counts how often it was asked and can be made to fail or stall. Answering
 * takes it a moment on the given clock, the way a real request does — so a status that
 * confuses "time passed" with "the check failed" is caught here rather than on the screen.
 */
function fakeFeed(
	release: LatestRelease | null = { tag: 'v0.0.11', url: null },
	clock?: ReturnType<typeof fakeClock>
) {
	const state = {
		calls: 0,
		release,
		fails: false,
		/** While set, an answer waits until the test opens it. */
		held: null as null | { opened: Promise<void> }
	};
	const feed: ReleaseFeed = {
		async latest() {
			state.calls += 1;
			if (state.held) await state.held.opened;
			clock?.advance(120);
			if (state.fails) throw new Error('unreachable');
			return state.release;
		}
	};
	return { feed, state };
}

describe('createUpdateCheck', () => {
	it('says a newer release is available, and where to read about it', async () => {
		const clock = fakeClock();
		const { feed } = fakeFeed(
			{ tag: 'v0.0.11', url: 'https://github.com/polandy/Stella/releases/tag/v0.0.11' },
			clock
		);
		const check = createUpdateCheck({ feed, clock, currentVersion: '0.0.10' });

		expect(await check.status()).toEqual({
			state: 'available',
			current: '0.0.10',
			latest: 'v0.0.11',
			releaseUrl: 'https://github.com/polandy/Stella/releases/tag/v0.0.11',
			checkedAt: clock.now(),
			stale: false
		});
	});

	it('says the instance is current when the newest release is the one running', async () => {
		const { feed } = fakeFeed({ tag: 'v0.0.10', url: null });
		const check = createUpdateCheck({ feed, clock: fakeClock(), currentVersion: '0.0.10' });

		expect((await check.status()).state).toBe('current');
	});

	it('asks upstream once a day, however often the page is opened', async () => {
		const { feed, state } = fakeFeed();
		const clock = fakeClock();
		const check = createUpdateCheck({ feed, clock, currentVersion: '0.0.10' });

		await check.status();
		await check.status();
		clock.advance(CHECK_INTERVAL_MS - 1);
		await check.status();
		expect(state.calls).toBe(1);

		clock.advance(1);
		await check.status();
		expect(state.calls).toBe(2);
	});

	it('asks once when two pages ask at the same moment', async () => {
		const { feed, state } = fakeFeed();
		const held = gate();
		state.held = held;
		const check = createUpdateCheck({ feed, clock: fakeClock(), currentVersion: '0.0.10' });

		const first = check.status();
		const second = check.status();
		held.open();
		await Promise.all([first, second]);

		expect(state.calls).toBe(1);
	});

	it('tries again within the hour after a failure, rather than waiting out the day', async () => {
		const clock = fakeClock();
		const { feed, state } = fakeFeed(undefined, clock);
		state.fails = true;
		const check = createUpdateCheck({ feed, clock, currentVersion: '0.0.10' });
		await check.status();

		// The interval runs from when the feed was asked, not from when it gave up, so the
		// time the failed request itself took counts towards it.
		clock.advance(RETRY_INTERVAL_MS - 121);
		await check.status();
		expect(state.calls).toBe(1);

		clock.advance(1);
		state.fails = false;
		expect((await check.status()).state).toBe('available');
		expect(state.calls).toBe(2);
	});

	it('reports unreachable when it has never got an answer', async () => {
		const { feed, state } = fakeFeed();
		state.fails = true;
		const check = createUpdateCheck({ feed, clock: fakeClock(), currentVersion: '0.0.10' });

		expect(await check.status()).toEqual({
			state: 'unreachable',
			current: '0.0.10',
			latest: null,
			releaseUrl: null,
			checkedAt: null,
			stale: true
		});
	});

	it('keeps a release it already knows when a later check fails', async () => {
		const { feed, state } = fakeFeed();
		const clock = fakeClock();
		const check = createUpdateCheck({ feed, clock, currentVersion: '0.0.10' });
		await check.status();
		const firstCheckedAt = clock.now();

		state.fails = true;
		clock.advance(CHECK_INTERVAL_MS);
		const status = await check.status();

		// A known newer release outranks a failed later check: the notice is still true, and
		// saying "I cannot reach GitHub" instead would lose it for a day.
		expect(status.state).toBe('available');
		expect(status.latest).toBe('v0.0.11');
		expect(status.checkedAt).toBe(firstCheckedAt);
		expect(status.stale).toBe(true);
	});

	it('marks an answer stale once a later check fails, so its age can be shown', async () => {
		const clock = fakeClock();
		const { feed, state } = fakeFeed({ tag: 'v0.0.10', url: null }, clock);
		const check = createUpdateCheck({ feed, clock, currentVersion: '0.0.10' });
		expect((await check.status()).stale).toBe(false);

		state.fails = true;
		clock.advance(CHECK_INTERVAL_MS);
		const status = await check.status();

		// Still "you are on the newest release" — but from yesterday's answer, and the line
		// says so rather than presenting it as today's.
		expect(status.state).toBe('current');
		expect(status.stale).toBe(true);
		expect(status.checkedAt).toBe(1_120);
	});

	it('reports current when the feed has no release at all', async () => {
		const { feed } = fakeFeed(null);
		const check = createUpdateCheck({ feed, clock: fakeClock(), currentVersion: '0.0.10' });

		expect((await check.status()).state).toBe('current');
	});

	it('never turns a tag it cannot read into an update', async () => {
		const { feed } = fakeFeed({ tag: 'nightly', url: null });
		const check = createUpdateCheck({ feed, clock: fakeClock(), currentVersion: '0.0.10' });

		const status = await check.status();
		expect(status.state).toBe('current');
		expect(status.latest).toBe('nightly');
	});
});
