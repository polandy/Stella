import { dispatchCommand } from '$lib/server/domain/commands/dispatch';
import { readCommand } from '$lib/server/commands/parse';
import type { CommandType } from '$lib/commands/commands';
import { occasionFromForm } from '$lib/gifts/gifts';
import { GiftGoneError } from '$lib/server/domain/gifts/gifts';
import { ulidGenerator } from '$lib/server/id';
import { systemClock } from '$lib/server/clock';
import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { requireViewer } from '$lib/server/auth/guards';
import { say, translator } from '$lib/server/i18n/say';

/*
 * A gift changed from a form (docs/02 §2.25): the person's Gifts card and the household's list
 * of ideas (§2.25.6) post the same commands (docs/04 §4.11.2) and answer the same way. The
 * occasion comes as two fields — a chip and the text beside *Other* — and is read the way the
 * outbox's `toCommand` reads it.
 */

export type GiftCommand = Extract<CommandType, `gift.${string}`>;

/** The occasion the form chose, as the payload carries it. */
export const occasionOf = (form: FormData) =>
	occasionFromForm(textOf(form, 'occasionChoice'), textOf(form, 'occasionText'));

export function textOf(form: FormData, key: string): string | null {
	const value = form.get(key);
	return typeof value === 'string' ? value : null;
}

/** Whose gift it is, and where the member lands once it worked. */
export interface GiftTarget {
	contactId: string;
	back: string;
}

/**
 * Apply one gift command for the member and answer as the form expects: back to `target.back`
 * when it worked, its reason under `errorKey` when it was refused.
 */
export async function applyGiftCommand(
	locals: RequestEvent['locals'],
	form: FormData,
	type: GiftCommand,
	payload: Record<string, unknown>,
	errorKey: 'giftError' | 'giftRowError',
	target: GiftTarget
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
		// The target goes last, so a posted field cannot overrule it.
		payload: { ...payload, contactId: target.contactId },
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
	throw redirect(303, target.back);
}
