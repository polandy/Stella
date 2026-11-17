import { dispatchCommand } from '$lib/server/domain/commands/dispatch';
import { readCommand } from '$lib/server/commands/parse';
import type { CommandType } from '$lib/commands/commands';
import { planVisibilityFromForm } from '$lib/plans/plans';
import { whenFromForm } from '$lib/when/form';
import { PlanGoneError } from '$lib/server/domain/plans/plans';
import { ulidGenerator } from '$lib/server/id';
import { systemClock } from '$lib/server/clock';
import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { requireViewer } from '$lib/server/auth/guards';
import { say, translator } from '$lib/server/i18n/say';

/*
 * An outing idea changed from a form (docs/dev/02 §2.27). The person's Outings card posts these
 * commands (docs/dev/04 §4.11.2) today; the household's list of ideas will post the same ones and
 * answer the same way, which is why this is shared rather than the card's own. Visibility and the
 * when are read the way the outbox's `toCommand` reads them.
 */

export type PlanCommand = Extract<CommandType, `plan.${string}`>;

/**
 * Where a refusal is shown: the add form's, a row's (which says which idea), or the card's own
 * line for a tick or a booking, which has no form to keep open.
 */
export type PlanErrorKey = 'planError' | 'planRowError' | 'planTickError';

/** Who may see it, as the three-way choice posted it. */
export const planVisibilityOf = (form: FormData) =>
	planVisibilityFromForm(textOf(form, 'visibility'));

/** When the idea is for, as the picker posted it. */
export const planWhenOf = (form: FormData) => whenFromForm((key) => textOf(form, key));

function textOf(form: FormData, key: string): string | null {
	const value = form.get(key);
	return typeof value === 'string' ? value : null;
}

/** Whose idea it is, and where the member lands once it worked. */
export interface PlanTarget {
	contactId: string;
	back: string;
}

/**
 * Apply one outing command for the member and answer as the form expects: back to `target.back`
 * when it worked, its reason under `errorKey` when it was refused.
 */
export async function applyPlanCommand(
	locals: RequestEvent['locals'],
	form: FormData,
	type: PlanCommand,
	payload: Record<string, unknown>,
	errorKey: PlanErrorKey,
	target: PlanTarget
) {
	const viewer = requireViewer(locals);
	const planId = textOf(form, 'planId');
	// A row's error is shown on its row, so it says which idea it is about.
	const failure = (message: string, status = 400) =>
		fail(
			status,
			errorKey === 'planRowError'
				? { planRowError: { planId, message } }
				: errorKey === 'planTickError'
					? { planTickError: message }
					: { planError: message }
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
					? reading.field === 'when'
						? 'errors.plan.badWhen'
						: 'errors.plan.needTitle'
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
		// An idea already gone answers 404: a held remove reads that as done (docs/dev/02 §2.23).
		const gone = outcome.error instanceof PlanGoneError;
		return failure(outcome.reason(translator(locals)), gone ? 404 : 400);
	}
	if (outcome.status !== 'applied') return failure(say(locals, 'errors.plan.couldNotSave'));
	throw redirect(303, target.back);
}
