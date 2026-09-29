import { describe, expect, it } from 'bun:test';
import { allOf } from './all-of';

/*
 * `Promise.all` over a record: each result lands under the name it was asked for, so a page
 * reading twenty things at once cannot mix up which answer is which by their position.
 */

describe('allOf', () => {
	it('settles every promise and hands each result back under its own name', async () => {
		const results = await allOf({ names: Promise.resolve(['Anna']), count: Promise.resolve(3) });
		expect(results).toEqual({ names: ['Anna'], count: 3 });
	});

	it('fails as a whole when any of them fails, as Promise.all does', async () => {
		const failing = allOf({ fine: Promise.resolve(1), broken: Promise.reject(new Error('no')) });
		await expect(failing).rejects.toThrow('no');
	});
});
