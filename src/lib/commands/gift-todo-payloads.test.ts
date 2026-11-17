import { describe, expect, it } from 'bun:test';
import * as v from 'valibot';
import { GiftAddSchema, GiftEditSchema, GiftMarkBoughtSchema } from './gift-todo-payloads';

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

describe('a gift command and whom it is kept from (docs/dev/02 §2.25.10)', () => {
	it('still takes a command written before surprises existed: nobody is left out', () => {
		expect(v.parse(GiftAddSchema, added).hiddenFromRecipient).toBeUndefined();
		expect(
			v.parse(GiftEditSchema, { ...added, giftId: 'g-1' }).hiddenFromRecipient
		).toBeUndefined();
	});

	it('carries the choice, and refuses anything but a yes or no', () => {
		expect(
			v.parse(GiftAddSchema, { ...added, hiddenFromRecipient: true }).hiddenFromRecipient
		).toBe(true);
		expect(v.safeParse(GiftAddSchema, { ...added, hiddenFromRecipient: 'yes' }).success).toBe(
			false
		);
	});

	it('adds no gift as already bought: that is only ever reached from an idea', () => {
		expect(v.safeParse(GiftAddSchema, { ...added, state: 'bought' }).success).toBe(false);
	});
});

describe('a gift marked bought, or not bought after all', () => {
	it('says which way, and nothing else', () => {
		const marked = { contactId: 'hilde', giftId: 'g-1', bought: true };
		expect(v.parse(GiftMarkBoughtSchema, marked)).toEqual(marked);
		expect(v.safeParse(GiftMarkBoughtSchema, { contactId: 'hilde', giftId: 'g-1' }).success).toBe(
			false
		);
	});
});
