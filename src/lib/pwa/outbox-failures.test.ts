import { describe, expect, it } from 'bun:test';
import type { CommandAnswer, JsonCommand } from '../commands/commands';
import {
	hold,
	queue,
	recallable,
	recover,
	release,
	revise,
	settle,
	takeBatch,
	type OutboxItem
} from './outbox';
import { FAILURE_SPACING_MS, STUCK_AFTER_FAILURES } from './outbox-failures';

/*
 * An item Stella keeps failing on (docs/dev/02 §2.18.1): counted once per round, it gets stuck
 * after a few rounds and waits for the member instead of holding up what comes after it.
 */

const moment = (id: string): JsonCommand => ({
	id,
	type: 'moment.capture',
	payload: { body: `moment ${id}`, entryDate: '2026-09-27', visibility: 'shared', newPeople: [] },
	issuedAt: 1
});

const add = (items: OutboxItem[], id: string) =>
	queue(items, { command: moment(id), memberId: 'u1', savedAt: 1 });

const failed = (id: string): CommandAnswer => ({ id, status: 'failed' });

/** One round that sends everything waiting, in which Stella fails on `id` at `now`. */
const failRound = (items: OutboxItem[], id: string, now: number) =>
	settle(takeBatch(items, 'u1', 10).items, [failed(id)], now);

/** `rounds` rounds failing on `id`, each a spacing apart. */
function failRounds(items: OutboxItem[], id: string, rounds: number): OutboxItem[] {
	let next = items;
	for (let round = 1; round <= rounds; round++)
		next = failRound(next, id, round * FAILURE_SPACING_MS);
	return next;
}

const stuckOne = () => failRounds(add([], 'a'), 'a', STUCK_AFTER_FAILURES);

describe('a command Stella fails on', () => {
	it('waits again, and the device remembers the failed try and when it was', () => {
		const [item] = failRound(add([], 'a'), 'a', 5_000);
		expect(item.state).toBe('pending');
		expect(item.attempts).toBe(1);
		expect(item.lastFailedAt).toBe(5_000);
	});

	it('counts failures close together once, so a burst of rounds cannot wedge it', () => {
		let items = failRound(add([], 'a'), 'a', 1_000);
		items = failRound(items, 'a', 1_000 + FAILURE_SPACING_MS - 1);
		expect(items[0].attempts).toBe(1);
		expect(items[0].lastFailedAt).toBe(1_000);
	});

	it('is not counted when only the answer was lost', () => {
		const [item] = settle(takeBatch(add([], 'a'), 'u1', 10).items, [], 5_000);
		expect(item.attempts).toBeUndefined();
	});

	it(`is stuck after ${STUCK_AFTER_FAILURES} failed rounds and still waits for the member`, () => {
		expect(failRounds(add([], 'a'), 'a', STUCK_AFTER_FAILURES - 1)[0].state).toBe('pending');
		const [item] = stuckOne();
		expect(item.state).toBe('stuck');
		expect(recallable(item)).toBe(true);
	});

	it('once stuck, is not sent again and no longer holds up the items behind it', () => {
		const items = add(stuckOne(), 'b');
		expect(takeBatch(items, 'u1', 10).batch.map((c) => c.id)).toEqual(['b']);
	});
});

describe('a stuck item', () => {
	it('goes back to stuck when its edit is closed, or the app closed mid-edit', () => {
		const held = hold(stuckOne(), 'a')!;
		expect(held[0].state).toBe('held');
		expect(release(held, 'a')[0].state).toBe('stuck');
		expect(recover(held)[0].state).toBe('stuck');
	});

	it('edited and saved, waits again under its own id with a fresh count', () => {
		const [item] = revise(hold(stuckOne(), 'a')!, 'a', moment('a').payload, 'fresh')!;
		expect(item.state).toBe('pending');
		expect(item.command.id).toBe('a');
		expect(item.attempts).toBeUndefined();
		expect(item.lastFailedAt).toBeUndefined();
	});
});
