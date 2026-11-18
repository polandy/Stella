import { describe, expect, it } from 'bun:test';
import * as v from 'valibot';
import {
	GiftAddSchema,
	GiftEditSchema,
	GiftGroupAddSchema,
	GiftMarkBoughtSchema
} from './gift-todo-payloads';

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
		const christmas = { kind: 'christmas_at_age' as const, age: 6 };
		expect(v.parse(GiftAddSchema, { ...added, when: christmas }).when).toEqual(christmas);
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

describe('one idea for several people (docs/dev/02 §2.25.11)', () => {
	const several = {
		title: 'Puzzle',
		when: { kind: 'at_age', age: 5 },
		recipients: [{ contactId: 'mia' }, { contactId: 'emma', when: null }]
	};

	it('carries each person, with a when of their own or none, and an estimated birth year', () => {
		const parsed = v.parse(GiftGroupAddSchema, {
			...several,
			recipients: [...several.recipients, { contactId: 'noah', birthYear: '2022' }]
		});
		expect(parsed).toMatchObject({ note: null, url: null, occasion: null, visibility: 'shared' });
		expect(parsed.recipients).toEqual([
			{ contactId: 'mia' },
			{ contactId: 'emma', when: null },
			{ contactId: 'noah', birthYear: '2022' }
		]);
	});

	it('refuses nobody, a nameless person, and a birth year that is not one', () => {
		const refused = (payload: object) =>
			v.safeParse(GiftGroupAddSchema, { ...several, ...payload }).success;
		expect(refused({ recipients: [] })).toBe(false);
		expect(refused({ recipients: [{ contactId: '' }] })).toBe(false);
		expect(refused({ recipients: [{ contactId: 'noah', birthYear: 'about 2020' }] })).toBe(false);
		expect(refused({ when: { kind: 'in_month', on: '2027-01' } })).toBe(false);
	});
});
