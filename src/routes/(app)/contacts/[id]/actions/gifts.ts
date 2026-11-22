import { fromFormData } from '#lib/commands/form-data.js';
import {
	GiftAddSchema,
	GiftAnswerWhenSchema,
	GiftAssignSchema,
	GiftEditSchema,
	GiftMarkGivenSchema,
	GiftRemoveSchema
} from '#lib/commands/gift-todo-payloads.js';
import { contactSectionPath } from '#lib/people/sections.js';
import { fail, type RequestEvent } from '@sveltejs/kit';
import { say } from '#lib/server/i18n/say.js';
import {
	applyGiftCommand,
	textOf,
	giversOf,
	occasionOf,
	boughtOf,
	surpriseOf,
	valueOf,
	visibilityOf,
	whenOf,
	type GiftCommand,
	type GiftErrorKey
} from '../../../_shared/gift-commands';
import { recordGivenFromForm } from '../../../_shared/gift-record';
import type { Actions } from '../$types';

/*
 * The Gifts card (docs/dev/02 §2.25). Every change is a command (docs/dev/04 §4.11.2): noting a gift may
 * wait on a phone like any addition; changing, giving and removing one go straight to Stella.
 */

/** One gift command on the person the URL names, back to their Gifts card when it worked. */
export const onCard = (
	{ params, locals }: Pick<RequestEvent, 'locals'> & { params: { id: string } },
	form: FormData,
	type: GiftCommand,
	payload: Record<string, unknown>,
	errorKey: GiftErrorKey
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
				...valueOf(form),
				occasion: occasionOf(form),
				when: whenOf(form),
				...giversOf(form)
			},
			'giftError'
		);
	},

	/** *Tomy gives…* (§2.25.15): the person the URL names gives an idea to whom the form chose. */
	addGiftBy: async (event) => {
		const form = await event.request.formData();
		const recipient = textOf(form, 'for');
		if (recipient === null) {
			return fail(400, { giftError: say(event.locals, 'errors.gift.needRecipient') });
		}
		return applyGiftCommand(
			event.locals,
			form,
			'gift.add',
			{
				...fromFormData(GiftAddSchema, form),
				state: 'idea',
				...visibilityOf(form),
				...valueOf(form),
				occasion: null,
				when: whenOf(form),
				giver: { contactId: event.params.id }
			},
			'giftError',
			{ contactId: recipient, back: contactSectionPath(event.params.id, 'gifts') }
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
				...valueOf(form),
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

	/** *Besorgt…*, *Erledigt* or undone (§2.25.9): posted once its toast's undo window has closed. */
	markGiftBought: async (event) => {
		const form = await event.request.formData();
		return onCard(event, form, 'gift.markBought', boughtOf(form), 'giftRowError');
	},

	/** *Vergeben…* (§2.25.12): who gives it, for when, and — its author only — kept from its person. */
	assignGift: async (event) => {
		const form = await event.request.formData();
		return onCard(
			event,
			form,
			'gift.assign',
			{
				...fromFormData(GiftAssignSchema, form),
				...giversOf(form),
				when: whenOf(form),
				hiddenFromRecipient: surpriseOf(form)
			},
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

	/** *Nachtragen…* (§2.25.14): what was given at a passed occasion, one command per gift. */
	recordGifts: async ({ request, locals, params }) =>
		recordGivenFromForm(locals, await request.formData(), contactSectionPath(params.id, 'gifts')),

	removeGift: async (event) => {
		const form = await event.request.formData();
		return onCard(event, form, 'gift.remove', fromFormData(GiftRemoveSchema, form), 'giftRowError');
	}
} satisfies Actions;
