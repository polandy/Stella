import { describe, expect, it } from 'bun:test';
import { GiftAddSchema } from '#lib/commands/gift-todo-payloads.js';
import * as v from 'valibot';
import { giftAddCommand } from './gift-add-command';

/*
 * The Gifts card's add form as the command the outbox keeps (docs/dev/02 §2.18): what the
 * three-way visibility posts (§2.25.10), and that a form which is not a gift yet is none.
 */

const formOf = (fields: Record<string, string>) => {
	const data = new FormData();
	for (const [key, value] of Object.entries(fields)) data.set(key, value);
	return data;
};
const idea = (visibility: string) =>
	giftAddCommand(formOf({ state: 'idea', title: 'Necklace', visibility }), 'cmd-1', 'julia', 7);

describe('giftAddCommand', () => {
	it('keeps an idea for *Everyone but them* from the person it is for, shared with the rest', () => {
		expect(idea('surprise')?.payload).toMatchObject({
			visibility: 'shared',
			hiddenFromRecipient: true
		});
	});

	it('keeps a private or shared idea from nobody', () => {
		expect(idea('private')?.payload).toMatchObject({
			visibility: 'private',
			hiddenFromRecipient: false
		});
		expect(idea('shared')?.payload).toMatchObject({
			visibility: 'shared',
			hiddenFromRecipient: false
		});
	});

	it('carries who gives an idea or gave a gift, and nobody on one received', () => {
		const given = { state: 'given', title: 'Kite', givenOn: '2025-12-24' };
		const of = (fields: Record<string, string>) => giftAddCommand(formOf(fields), 'c', 'julia', 7);
		expect(of({ state: 'idea', title: 'Kite', giver: 'sandra' })?.payload.giver).toEqual({
			contactId: 'sandra'
		});
		expect(of({ ...given, giver: 'household' })?.payload.giver).toEqual({ household: true });
		expect(of({ state: 'idea', title: 'Kite' })?.payload.giver).toBeNull();
		expect(of({ ...given, state: 'received', giver: 'sandra' })?.payload.giver).toBeNull();
		expect(v.safeParse(GiftAddSchema, of({ ...given, giver: 'sandra' })?.payload).success).toBe(
			true
		);
	});

	it('makes a payload the command schema takes', () => {
		expect(v.safeParse(GiftAddSchema, idea('surprise')?.payload).success).toBe(true);
	});

	it('is no command without a title, for a state that cannot be added, or a gift without its day', () => {
		expect(giftAddCommand(formOf({ state: 'idea', title: ' ' }), 'c', 'julia', 7)).toBeNull();
		expect(giftAddCommand(formOf({ state: 'bought', title: 'Bike' }), 'c', 'julia', 7)).toBeNull();
		expect(giftAddCommand(formOf({ state: 'given', title: 'Bike' }), 'c', 'julia', 7)).toBeNull();
	});
});
