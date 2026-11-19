import type { CommandType } from '$lib/commands/commands';
import { occasionFromForm, visibilityFromForm } from '$lib/gifts/gifts';
import { whenFromForm } from '$lib/when/form';
import { GiftGoneError } from '$lib/server/domain/gifts/gifts';
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
