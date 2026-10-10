import { dispatchCommand } from '$lib/server/domain/commands/dispatch';
import { readCommand } from '$lib/server/commands/parse';
import { fromFormData } from '$lib/commands/form-data';
import {
	GiftAddSchema,
	GiftEditSchema,
	GiftMarkGivenSchema,
	GiftRemoveSchema
} from '$lib/commands/payloads';
import type { CommandType } from '$lib/commands/commands';
import { occasionFromForm } from '$lib/gifts/gifts';
import { GiftGoneError } from '$lib/server/domain/gifts/gifts';
import { contactSectionPath } from '$lib/people/sections';
import { ulidGenerator } from '$lib/server/id';
import { systemClock } from '$lib/server/clock';
import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { requireViewer } from '$lib/server/auth/guards';
import { say, translator } from '$lib/server/i18n/say';
import type { Actions } from '../$types';

/*
 * The Gifts card (docs/02 §2.25). Every change is a command (docs/04 §4.11.2): noting a gift may
 * wait on a phone like any addition; changing, giving and removing one go straight to Stella.
 * The occasion comes as two fields — a chip and the text beside *Other* — and is read the way
 * the outbox's `toCommand` reads it.
 */

type GiftCommand = Extract<CommandType, `gift.${string}`>;

/** The occasion the form chose, as the payload carries it. */
const occasionOf = (form: FormData) =>
	occasionFromForm(textOf(form, 'occasionChoice'), textOf(form, 'occasionText'));

function textOf(form: FormData, key: string): string | null {
	const value = form.get(key);
	return typeof value === 'string' ? value : null;
}

/**
 * Apply one gift command for the member and answer as the card expects: back to the card when
 * it worked, its reason under `errorKey` when it was refused.
 */
async function applyGiftCommand(
	{ params, locals }: Pick<RequestEvent, 'locals'> & { params: { id: string } },
	form: FormData,
	type: GiftCommand,
	payload: Record<string, unknown>,
	errorKey: 'giftError' | 'giftRowError'
) {
	const viewer = requireViewer(locals);
	const giftId = textOf(form, 'giftId');
	// A row's error is shown on its row, so it says which gift it is about.
	const failure = (message: string, status = 400) =>
		fail(
			status,
			errorKey === 'giftRowError' ? { giftRowError: { giftId, message } } : { giftError: message }
		);

	const reading = readCommand({
		id: form.get('commandId') || ulidGenerator.next(),
		type,
		// What the URL says goes last, so a posted field cannot overrule it.
		payload: { ...payload, contactId: params.id },
		issuedAt: systemClock.now()
	});
	if (!reading.ok) {
		return failure(
			say(
				locals,
				reading.part === 'payload'
					? reading.field === 'givenOn'
						? 'errors.gift.needDay'
						: 'errors.gift.needTitle'
					: 'errors.command.malformed'
			)
		);
	}
	const actor = { userId: viewer.id, householdId: viewer.householdId, locale: locals.locale };
	const outcome = await dispatchCommand(
		locals.services.offline.commandDeps,
		actor,
		reading.command
	);
	if (outcome.status === 'refused') {
		// A gift already gone answers 404: a held remove reads that as done (docs/02 §2.23).
		const gone = outcome.error instanceof GiftGoneError;
		return failure(outcome.reason(translator(locals)), gone ? 404 : 400);
	}
	if (outcome.status !== 'applied') return failure(say(locals, 'errors.gift.couldNotSave'));
	throw redirect(303, contactSectionPath(params.id, 'gifts'));
}

export const giftActions = {
	addGift: async (event) => {
		const form = await event.request.formData();
		return applyGiftCommand(
			event,
			form,
			'gift.add',
			{ ...fromFormData(GiftAddSchema, form), occasion: occasionOf(form) },
			'giftError'
		);
	},

	editGift: async (event) => {
		const form = await event.request.formData();
		return applyGiftCommand(
			event,
			form,
			'gift.edit',
			{ ...fromFormData(GiftEditSchema, form), occasion: occasionOf(form) },
			'giftRowError'
		);
	},

	markGiftGiven: async (event) => {
		const form = await event.request.formData();
		return applyGiftCommand(
			event,
			form,
			'gift.markGiven',
			{ ...fromFormData(GiftMarkGivenSchema, form), occasion: occasionOf(form) },
			'giftRowError'
		);
	},

	removeGift: async (event) => {
		const form = await event.request.formData();
		return applyGiftCommand(
			event,
			form,
			'gift.remove',
			fromFormData(GiftRemoveSchema, form),
			'giftRowError'
		);
	}
} satisfies Actions;
