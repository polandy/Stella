import { fromFormData } from '#lib/commands/form-data.js';
import {
	GiftGroupEditSchema,
	GiftGroupGiftSchema,
	GiftGroupRefSchema,
	GiftMarkBoughtSchema,
	GiftMarkGivenSchema,
	GiftRemoveSchema
} from '#lib/commands/gift-todo-payloads.js';
import { contactSectionPath } from '#lib/people/sections.js';
import type { RequestEvent } from '@sveltejs/kit';
import { applyGiftCommand, occasionOf, textOf, whenOf } from '../../../_shared/gift-commands';
import type { Actions } from '../$types';
import { onCard } from './gifts';

/*
 * *Who has it?* on the Gifts card (docs/dev/02 §2.25.11): one idea several people get, followed up
 * from any of them. A row changes the gift of the person it names, and lands back on this card.
 */

type CardEvent = Pick<RequestEvent, 'locals'> & { params: { id: string } };

/** One gift of the group, on the person the row names. */
const onRow = (
	{ params, locals }: CardEvent,
	form: FormData,
	type: 'gift.markGiven' | 'gift.markBought' | 'gift.remove',
	payload: Record<string, unknown>
) =>
	applyGiftCommand(locals, form, type, payload, 'giftGroupError', {
		contactId: textOf(form, 'contactId') ?? '',
		back: contactSectionPath(params.id, 'gifts')
	});

function recipientsOf(form: FormData): unknown {
	try {
		return JSON.parse(textOf(form, 'recipients') ?? '');
	} catch {
		return null;
	}
}

export const giftGroupActions = {
	/** *+ Person*: each gets the group's when as it comes to for them (F11). */
	addGroupRecipients: async (event) => {
		const form = await event.request.formData();
		return onCard(
			event,
			form,
			'giftGroup.addRecipients',
			{ ...fromFormData(GiftGroupRefSchema, form), recipients: recipientsOf(form) },
			'giftGroupError'
		);
	},

	/** *Change*: for every open gift of it, or — `only` — for one person's (D6). */
	editGiftGroup: async (event) => {
		const form = await event.request.formData();
		const only = textOf(form, 'only');
		return onCard(
			event,
			form,
			'giftGroup.edit',
			{
				...fromFormData(GiftGroupEditSchema, form),
				...(only ? { giftId: only } : {}),
				when: whenOf(form)
			},
			'giftGroupError'
		);
	},

	/** *Bought for everyone*: posted once its toast's undo window has closed (§2.25.9). */
	markGroupBought: async (event) => {
		const form = await event.request.formData();
		const ref = fromFormData(GiftGroupRefSchema, form);
		return onCard(event, form, 'giftGroup.markBought', ref, 'giftGroupError');
	},

	/** *Remove all open*: the given ones stay. */
	removeGroupOpen: async (event) => {
		const form = await event.request.formData();
		const ref = fromFormData(GiftGroupRefSchema, form);
		return onCard(event, form, 'giftGroup.removeOpen', ref, 'giftGroupError');
	},

	/** *Go on one by one* (D8): the gifts stay, only *also for* goes. */
	dissolveGiftGroup: async (event) => {
		const form = await event.request.formData();
		const ref = fromFormData(GiftGroupRefSchema, form);
		return onCard(event, form, 'giftGroup.dissolve', ref, 'giftGroupError');
	},

	detachGroupGift: async (event) => {
		const form = await event.request.formData();
		const ref = fromFormData(GiftGroupGiftSchema, form);
		return onCard(event, form, 'giftGroup.detach', ref, 'giftGroupError');
	},

	markGroupGiftGiven: async (event) => {
		const form = await event.request.formData();
		const payload = { ...fromFormData(GiftMarkGivenSchema, form), occasion: occasionOf(form) };
		return onRow(event, form, 'gift.markGiven', payload);
	},

	markGroupGiftBought: async (event) => {
		const form = await event.request.formData();
		return onRow(event, form, 'gift.markBought', fromFormData(GiftMarkBoughtSchema, form));
	},

	removeGroupGift: async (event) => {
		const form = await event.request.formData();
		return onRow(event, form, 'gift.remove', fromFormData(GiftRemoveSchema, form));
	}
} satisfies Actions;
