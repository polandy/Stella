import { describe, expect, it } from 'bun:test';
import * as v from 'valibot';
import { GiftAddSchema, GiftEditSchema } from './gift-todo-payloads';

/* What a gift command may carry about when the idea is for (docs/dev/02 §2.25.8). */

const added = {
	contactId: 'hilde',
	state: 'idea',
	title: 'Teapot',
	note: null,
	url: null,
	givenOn: null,
	occasion: null,
	visibility: 'shared'
};

describe('a gift command and its when', () => {
	it('still takes a command written before whens existed', () => {
		expect(v.parse(GiftAddSchema, added).when).toBeUndefined();
		expect(v.parse(GiftEditSchema, { ...added, giftId: 'g-1' }).when).toBeUndefined();
	});

	it('carries a when, and refuses a malformed one', () => {
		const when = { kind: 'at_age' as const, age: 18 };
		expect(v.parse(GiftAddSchema, { ...added, when }).when).toEqual(when);
		expect(
			v.safeParse(GiftEditSchema, { ...added, giftId: 'g-1', when: { kind: 'at_age' } }).success
		).toBe(false);
	});
});
