import { describe, expect, test } from 'bun:test';
import { sendRounds } from './send-rounds';

/** A promise the test settles by hand, so no step waits on a clock. */
function deferred(): { promise: Promise<void>; resolve: () => void; reject: (e: unknown) => void } {
	let resolve!: () => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe('sendRounds', () => {
	test('a round that ends normally is over once', async () => {
		const log: string[] = [];
		const send = sendRounds({
			round: async () => void log.push('round'),
			roundOver: () => log.push('over'),
			failed: () => log.push('failed')
		});
		await send();
		expect(log).toEqual(['round', 'over']);
	});

	test('a round that throws still ends: the watchers are told and the error is logged', async () => {
		const log: unknown[] = [];
		const boom = new Error('QuotaExceededError');
		const send = sendRounds({
			round: () => Promise.reject(boom),
			roundOver: () => log.push('over'),
			failed: (error) => log.push(error)
		});
		await send();
		expect(log).toEqual([boom, 'over']);
	});

	test('after a round that threw, the next send runs a round again', async () => {
		let rounds = 0;
		const send = sendRounds({
			round: async () => {
				rounds += 1;
				if (rounds === 1) throw new Error('blocked');
			},
			roundOver: () => {},
			failed: () => {}
		});
		await send();
		await send();
		expect(rounds).toBe(2);
	});

	test('a send asked for during a round goes once more after it, and the round is over only then', async () => {
		const log: string[] = [];
		const first = deferred();
		let rounds = 0;
		const send = sendRounds({
			round: async () => {
				rounds += 1;
				log.push(`round ${rounds}`);
				if (rounds === 1) await first.promise;
			},
			roundOver: () => log.push('over'),
			failed: () => log.push('failed')
		});
		const running = send();
		await send();
		await send();
		first.resolve();
		await running;
		expect(log).toEqual(['round 1', 'round 2', 'over']);
	});

	test('a send asked for during a round that throws still goes again', async () => {
		const log: string[] = [];
		const first = deferred();
		let rounds = 0;
		const send = sendRounds({
			round: async () => {
				rounds += 1;
				log.push(`round ${rounds}`);
				if (rounds === 1) await first.promise;
			},
			roundOver: () => log.push('over'),
			failed: () => log.push('failed')
		});
		const running = send();
		await send();
		first.reject(new Error('corrupt record'));
		await running;
		expect(log).toEqual(['round 1', 'failed', 'round 2', 'over']);
	});
});
