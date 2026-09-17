import { describe, expect, it } from 'bun:test';
import type { SubmitFunction } from '@sveltejs/kit';
import { trackPending, whilePending } from './pending';
import type { PendingSink } from './pending-work';

/** A sink that writes down what it was told, so a test can assert on the order. */
function recorder(): { calls: string[]; sink: PendingSink } {
	const calls: string[] = [];
	return {
		calls,
		sink: {
			begin: () => void calls.push('begin'),
			end: () => void calls.push('end'),
		},
	};
}

/** A promise the test resolves by hand — no timers, so nothing here can race. */
function deferred<T>(): {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (error: Error) => void;
} {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

type SubmitInput = Parameters<SubmitFunction>[0];
type SubmitOptions = Parameters<Exclude<Awaited<ReturnType<SubmitFunction>>, void>>[0];

const submitInput = {} as unknown as SubmitInput;
/** The enhance callback's argument, of which only `update` is reached here. */
const options = (update: () => Promise<void>): SubmitOptions =>
	({ update }) as unknown as SubmitOptions;

describe('trackPending', () => {
	it('counts the submission from the moment it is sent until the page has caught up', async () => {
		const { calls, sink } = recorder();
		const settled = deferred<void>();
		const inner: SubmitFunction = () => async () => {
			await settled.promise;
		};

		const callback = trackPending(sink, inner)(submitInput);
		expect(calls).toEqual(['begin']);

		const done = (callback as (o: SubmitOptions) => Promise<void>)(options(async () => {}));
		expect(calls).toEqual(['begin']);

		settled.resolve();
		await done;
		expect(calls).toEqual(['begin', 'end']);
	});

	it('stops counting when the submission fails, and lets the failure through', async () => {
		const { calls, sink } = recorder();
		const inner: SubmitFunction = () => async () => {
			throw new Error('offline');
		};

		const callback = trackPending(sink, inner)(submitInput);
		const done = (callback as (o: SubmitOptions) => Promise<void>)(options(async () => {}));

		await expect(done).rejects.toThrow('offline');
		expect(calls).toEqual(['begin', 'end']);
	});

	it('applies the result itself when the wrapped function leaves that to enhance', async () => {
		const { calls, sink } = recorder();
		const applied: string[] = [];
		const inner: SubmitFunction = () => undefined;

		const callback = trackPending(sink, inner)(submitInput);
		await (callback as (o: SubmitOptions) => Promise<void>)(
			options(async () => void applied.push('update')),
		);

		expect(applied).toEqual(['update']);
		expect(calls).toEqual(['begin', 'end']);
	});
});

describe('whilePending', () => {
	it('counts the work and hands back its result', async () => {
		const { calls, sink } = recorder();
		const result = await whilePending(sink, async () => {
			expect(calls).toEqual(['begin']);
			return 'done';
		});

		expect(result).toBe('done');
		expect(calls).toEqual(['begin', 'end']);
	});

	it('stops counting when the work throws', async () => {
		const { calls, sink } = recorder();

		await expect(
			whilePending(sink, async () => {
				throw new Error('nope');
			}),
		).rejects.toThrow('nope');
		expect(calls).toEqual(['begin', 'end']);
	});
});
