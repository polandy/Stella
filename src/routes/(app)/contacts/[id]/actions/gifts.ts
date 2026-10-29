import { fromFormData } from '$lib/commands/form-data';
import {
	GiftAddSchema,
	GiftEditSchema,
	GiftMarkGivenSchema,
	GiftRemoveSchema
} from '$lib/commands/payloads';
import { contactSectionPath } from '$lib/people/sections';
import type { RequestEvent } from '@sveltejs/kit';
import { applyGiftCommand, occasionOf, type GiftCommand } from '../../../_shared/gift-commands';
import type { Actions } from '../$types';

/*
 * The Gifts card (docs/02 §2.25). Every change is a command (docs/04 §4.11.2): noting a gift may
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
			{ ...fromFormData(GiftAddSchema, form), occasion: occasionOf(form) },
			'giftError'
		);
	},

	editGift: async (event) => {
		const form = await event.request.formData();
		return onCard(
			event,
			form,
			'gift.edit',
			{ ...fromFormData(GiftEditSchema, form), occasion: occasionOf(form) },
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

	removeGift: async (event) => {
		const form = await event.request.formData();
		return onCard(event, form, 'gift.remove', fromFormData(GiftRemoveSchema, form), 'giftRowError');
	}
} satisfies Actions;
