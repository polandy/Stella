import type { CommandType } from '#lib/commands/commands.js';
import { fromFormData } from '#lib/commands/form-data.js';
import { GiftMarkBoughtSchema } from '#lib/commands/gift-todo-payloads.js';
import { giverFromForm, occasionFromForm, visibilityFromForm } from '#lib/gifts/gifts.js';
import { whenFromForm } from '#lib/when/form.js';
import { GiftGoneError } from '#lib/server/domain/gifts/gifts.js';
import { fail, type RequestEvent } from '@sveltejs/kit';
import {
	applyCommandFromForm,
	textOf,
	type CommandFormEdge,
	type CommandFormTarget
} from './command-form';

export { textOf };

/*
 * A gift changed from a form (docs/dev/02 §2.25): the person's Gifts card and the household's list
 * of ideas (§2.25.6) post the same commands (docs/dev/04 §4.11.2) and answer the same way. The
 * occasion comes as two fields — a chip and the text beside *Other* — and is read the way the
 * outbox's `toCommand` reads it; so does when an idea is for (§2.25.8).
 */

export type GiftCommand = Extract<CommandType, `gift.${string}` | `giftGroup.${string}`>;

/** Where a refusal shows: the card, a gift's row, or the panel of a group (§2.25.11). */
export type GiftErrorKey = 'giftError' | 'giftRowError' | 'giftGroupError';

/** The occasion the form chose, as the payload carries it. */
export const occasionOf = (form: FormData) =>
	occasionFromForm(textOf(form, 'occasionChoice'), textOf(form, 'occasionText'));

/** Who may see it, as the three-way choice posted it (§2.25.10). */
export const visibilityOf = (form: FormData) => visibilityFromForm(textOf(form, 'visibility'));

/** When the idea is for, as the picker posted it; undefined where the form has no picker. */
export const whenOf = (form: FormData) => whenFromForm((key) => textOf(form, key));

/** Who gives it, as the giver field posted it (§2.25.12); left out or empty, or *Wieder frei*, nobody. */
export const giverOf = (form: FormData) =>
	textOf(form, 'free') ? null : giverFromForm(textOf(form, 'giver'));

/** The surprise a giver's form asks for (§2.25.12, D4); undefined where the form has no such box. */
export function surpriseOf(form: FormData): boolean | undefined {
	const asked = textOf(form, 'surprise');
	return asked === null ? undefined : asked === 'kept';
}

/** *Besorgt…*, *Erledigt* or undone (§2.25.9): a box the form leaves out is never sent as *no*. */
export const boughtOf = (form: FormData) => ({
	...fromFormData(GiftMarkBoughtSchema, form),
	storedAt: textOf(form, 'storedAt') ?? undefined,
	hiddenFromRecipient: surpriseOf(form)
});

/** Which field names which mistake; a gift group's form answers the same way. */
const GIFT_FORM: CommandFormEdge = {
	fieldErrors: {
		title: 'errors.gift.needTitle',
		url: 'errors.gift.badLink',
		givenOn: 'errors.gift.needDay',
		when: 'errors.gift.badWhen',
		recipients: 'errors.giftGroup.recipients'
	},
	couldNotSave: 'errors.gift.couldNotSave',
	isGone: (error) => error instanceof GiftGoneError
};

/** Whose gift it is, and where the member lands once it worked. */
export type GiftTarget = CommandFormTarget;

/**
 * Apply one gift command for the member and answer as the form expects: back to `target.back`
 * when it worked, its reason under `errorKey` when it was refused.
 */
export async function applyGiftCommand(
	locals: RequestEvent['locals'],
	form: FormData,
	type: GiftCommand,
	payload: Record<string, unknown>,
	errorKey: GiftErrorKey,
	target: GiftTarget
) {
	const giftId = textOf(form, 'giftId');
	const groupId = textOf(form, 'groupId');
	// A row's or a panel's error is shown there, so it says which gift or group it is about.
	const failure = (message: string, status: number) =>
		fail(
			status,
			errorKey === 'giftRowError'
				? { giftRowError: { giftId, message } }
				: errorKey === 'giftGroupError'
					? { giftGroupError: { groupId, message } }
					: { giftError: message }
		);
	return applyCommandFromForm(locals, form, type, payload, GIFT_FORM, target, failure);
}
