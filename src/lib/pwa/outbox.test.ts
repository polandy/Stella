import { describe, expect, it } from 'bun:test';
import type { Command, CommandAnswer } from '../commands/commands';
import {
	discard,
	hold,
	queue,
	recover,
	release,
	revise,
	settle,
	takeBatch,
	unsend,
	type OutboxItem
} from './outbox';

/*
 * The outbox (docs/concepts/offline-capture.md §4): what a phone holds back while Stella is out
 * of reach. Pure — the IndexedDB store and the fetch that sends are adapters around it. The
 * rule it keeps: nothing leaves until Stella has confirmed it or the member discards it, and an
 * item being edited is never sent from under the editor.
 */

const moment = (id: string, body = `moment ${id}`): Command => ({
	id,
	type: 'moment.capture',
	payload: { body, entryDate: '2026-09-27', visibility: 'shared', newPeople: [] },
	issuedAt: 1
});

const add = (items: OutboxItem[], id: string, memberId = 'u1') =>
	queue(items, { command: moment(id), memberId, savedAt: 1 });

const states = (items: OutboxItem[]) => items.map((i) => [i.command.id, i.state]);

describe('queue and takeBatch', () => {
	it('sends a member’s pending items in the order they were written, and marks them in flight', () => {
		let items = add(add(add([], 'a'), 'b', 'u2'), 'c');
		const { items: after, batch } = takeBatch(items, 'u1', 10);

		expect(batch.map((c) => c.id)).toEqual(['a', 'c']);
		expect(states(after)).toEqual([
			['a', 'sending'],
			['b', 'pending'],
			['c', 'sending']
		]);
	});

	it('sends no more than the batch allows; the rest wait for the next round', () => {
		const items = add(add(add([], 'a'), 'b'), 'c');
		expect(takeBatch(items, 'u1', 2).batch.map((c) => c.id)).toEqual(['a', 'b']);
	});

	it('does not send an item that is being edited, or one Stella refused', () => {
		let items = add(add(add([], 'a'), 'b'), 'c');
		items = hold(items, 'a')!;
		items = settle(takeBatch(items, 'u1', 10).items, [
			{ id: 'b', status: 'refused', reason: 'nobody' },
			{ id: 'c', status: 'busy' }
		]);
		expect(takeBatch(items, 'u1', 10).batch.map((c) => c.id)).toEqual(['c']);
	});
});

describe('settle', () => {
	it('lets go of what Stella applied, keeps what it refused with the reason, and retries the rest', () => {
		const sent = takeBatch(add(add(add(add([], 'a'), 'b'), 'c'), 'd'), 'u1', 10).items;
		const answers: CommandAnswer[] = [
			{ id: 'a', status: 'applied', result: {} },
			{ id: 'b', status: 'refused', reason: 'Julia was deleted' },
			{ id: 'c', status: 'failed' }
			// 'd' went unanswered.
		];
		const items = settle(sent, answers);

		expect(states(items)).toEqual([
			['b', 'refused'],
			['c', 'pending'],
			['d', 'pending']
		]);
		expect(items[0].reason).toBe('Julia was deleted');
	});

	it('puts everything in flight back when the request never got an answer', () => {
		const sent = takeBatch(add(add([], 'a'), 'b'), 'u1', 1).items;
		expect(states(unsend(sent))).toEqual([
			['a', 'pending'],
			['b', 'pending']
		]);
	});
});

describe('editing before it is sent', () => {
	it('holds an item while it is edited and replaces its content, keeping its id', () => {
		let items = add([], 'a');
		items = hold(items, 'a')!;
		expect(states(items)).toEqual([['a', 'held']]);

		items = revise(items, 'a', { ...moment('a').payload, body: 'better @Julia' }, 'new-id')!;
		expect(items[0].command.id).toBe('a');
		expect(items[0].command.payload.body).toBe('better @Julia');
		expect(items[0].state).toBe('pending');
	});

	it('gives a refused item a fresh id when it is corrected, so it is a new command', () => {
		let items = settle(takeBatch(add([], 'a'), 'u1', 10).items, [
			{ id: 'a', status: 'refused', reason: 'nobody' }
		]);
		items = revise(hold(items, 'a')!, 'a', { ...moment('a').payload, body: 'with @Julia' }, 'a2')!;

		expect(items[0].command.id).toBe('a2');
		expect(items[0].state).toBe('pending');
		expect(items[0].reason).toBeNull();
	});

	it('returns a held item to where it was when the edit is abandoned', () => {
		let items = settle(takeBatch(add(add([], 'a'), 'b'), 'u1', 10).items, [
			{ id: 'a', status: 'refused', reason: 'nobody' },
			{ id: 'b', status: 'failed' }
		]);
		items = release(release(hold(hold(items, 'a')!, 'b')!, 'a'), 'b');
		expect(states(items)).toEqual([
			['a', 'refused'],
			['b', 'pending']
		]);
	});

	it('will not hold or discard an item that is on its way, so an edit cannot be lost in flight', () => {
		const sent = takeBatch(add([], 'a'), 'u1', 10).items;
		expect(hold(sent, 'a')).toBeNull();
		expect(discard(sent, 'a')).toBeNull();
		expect(revise(sent, 'a', moment('a').payload, 'x')).toBeNull();
	});

	it('discards an item the member no longer wants', () => {
		expect(states(discard(add(add([], 'a'), 'b'), 'a')!)).toEqual([['b', 'pending']]);
	});
});

describe('recover', () => {
	it('picks up where a closed app left off: nothing stays in flight or held', () => {
		let items = settle(takeBatch(add(add(add([], 'a'), 'b'), 'c'), 'u1', 1).items, []);
		items = takeBatch(items, 'u1', 1).items; // 'a' is in flight again
		items = hold(items, 'b')!;
		items = [...items, { ...items[2], command: moment('d'), state: 'refused', reason: 'nobody' }];
		items = hold(items, 'd')!;

		expect(states(recover(items))).toEqual([
			['a', 'pending'],
			['b', 'pending'],
			['c', 'pending'],
			['d', 'refused']
		]);
	});
});
