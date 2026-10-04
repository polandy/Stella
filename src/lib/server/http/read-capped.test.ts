import { describe, expect, it } from 'bun:test';
import { readCapped } from './read-capped';

describe('readCapped', () => {
	it('reads a body up to the cap', async () => {
		expect(new TextDecoder().decode(await readCapped(new Response('hello'), 5))).toBe('hello');
	});

	it('reads an empty body as no bytes', async () => {
		expect(await readCapped(new Response(null), 5)).toEqual(new Uint8Array());
	});

	it('refuses a body longer than the cap rather than buffering it', async () => {
		expect(readCapped(new Response('hello!'), 5)).rejects.toThrow('more than 5 bytes');
	});
});
