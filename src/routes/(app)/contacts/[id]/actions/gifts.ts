import { fromFormData } from '$lib/commands/form-data';
import {
	GiftAddSchema,
	GiftAnswerWhenSchema,
	GiftEditSchema,
	GiftMarkBoughtSchema,
	GiftMarkGivenSchema,
	GiftRemoveSchema
} from '$lib/commands/gift-todo-payloads';
import { contactSectionPath } from '$lib/people/sections';
import type { RequestEvent } from '@sveltejs/kit';
import {
	applyGiftCommand,
	occasionOf,
	visibilityOf,
	whenOf,
	type GiftCommand
} from '../../../_shared/gift-commands';
import type { Actions } from '../$types';

/*
 * The Gifts card (docs/dev/02 §2.25). Every change is a command (docs/dev/04 §4.11.2): noting a gift may
 * wait on a phone like any addition; changing, giving and removing one go straight to Stella.
 */

/** One gift command on the person the URL names, back to their Gifts card when it worked. */
const onCard = (
	{ params, locals }: Pick<RequestEvent, 'locals'> & { params: { id: string } },
	form: FormData,
	type: GiftCommand,
	payload: Record<string, unknown>,
	errorKey: 'giftError' | 'giftRowError'
) =>
	applyGiftCommand(locals, form, type, payload, errorKey, {
		contactId: params.id,
		back: contactSectionPath(params.id, 'gifts')
	});

export const giftActions = {
	addGift: async (event) => {
		const form = await event.request.formData();
		return onCard(
			event,
			form,
			'gift.add',
			{
				...fromFormData(GiftAddSchema, form),
				...visibilityOf(form),
				occasion: occasionOf(form),
				when: whenOf(form)
			},
			'giftError'
		);
	},

	editGift: async (event) => {
		const form = await event.request.formData();
		return onCard(
			event,
			form,
			'gift.edit',
			{
				...fromFormData(GiftEditSchema, form),
				...visibilityOf(form),
				occasion: occasionOf(form),
				when: whenOf(form)
			},
			'giftRowError'
		);
	},

	markGiftGiven: async (event) => {
		const form = await event.request.formData();
		return onCard(
			event,
			form,
			'gift.markGiven',
			{ ...fromFormData(GiftMarkGivenSchema, form), occasion: occasionOf(form) },
			'giftRowError'
		);
	},

	/** *Bought*, or *Not bought yet* (§2.25.9): posted once its toast's undo window has closed. */
	markGiftBought: async (event) => {
		const form = await event.request.formData();
		return onCard(
			event,
			form,
			'gift.markBought',
			fromFormData(GiftMarkBoughtSchema, form),
			'giftRowError'
		);
	},

	/** *Still current?* answered (§2.25.8): kept as a plain idea, or given a new when. */
	answerGiftWhen: async (event) => {
		const form = await event.request.formData();
		return onCard(
			event,
			form,
			'gift.answerWhen',
			{ ...fromFormData(GiftAnswerWhenSchema, form), when: whenOf(form) },
			'giftRowError'
		);
	},

	removeGift: async (event) => {
		const form = await event.request.formData();
		return onCard(event, form, 'gift.remove', fromFormData(GiftRemoveSchema, form), 'giftRowError');
	}
} satisfies Actions;
