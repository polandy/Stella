import { describe, expect, it } from 'bun:test';
import { SAVED_NOTICE, savedEnhance } from './saved';

/*
 * The "Saved" toast (docs/05 §5.7): a form that succeeded says so, a form that came back with
 * an error says nothing — the error already has a home in the section that opened it.
 */

function run(resultType: string) {
	const notices: string[] = [];
	const updates: number[] = [];
	const closed: number[] = [];
	const handler = savedEnhance({ notify: (text) => notices.push(text) }, () => closed.push(1));
	return {
		notices,
		updates,
		closed,
		async finish() {
			const callback = await handler({} as never);
			if (typeof callback !== 'function') throw new Error('savedEnhance must return a callback');
			await callback({
				result: { type: resultType } as never,
				update: async () => void updates.push(1)
			} as never);
		}
	};
}

describe('savedEnhance', () => {
	it('says Saved once the successful result has been applied, and closes the section', async () => {
		const { notices, updates, closed, finish } = run('success');
		await finish();
		expect(updates).toHaveLength(1);
		expect(notices).toEqual([SAVED_NOTICE]);
		expect(closed).toHaveLength(1);
	});

	it('says Saved on a redirect, which is how the actions answer a save', async () => {
		const { notices, finish } = run('redirect');
		await finish();
		expect(notices).toEqual([SAVED_NOTICE]);
	});

	it('stays quiet when the action failed, keeps the section open, and still applies the result', async () => {
		const { notices, updates, closed, finish } = run('failure');
		await finish();
		expect(updates).toHaveLength(1);
		expect(notices).toEqual([]);
		expect(closed).toEqual([]);
	});

	it('stays quiet when the request itself errored', async () => {
		const { notices, finish } = run('error');
		await finish();
		expect(notices).toEqual([]);
	});
});
