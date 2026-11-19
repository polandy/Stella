import type { CommandType } from '$lib/commands/commands';
import { planVisibilityFromForm } from '$lib/plans/plans';
import { whenFromForm } from '$lib/when/form';
import { PlanGoneError } from '$lib/server/domain/plans/plans';
import { fail, type RequestEvent } from '@sveltejs/kit';
import {
	applyCommandFromForm,
	textOf,
	type CommandFormEdge,
	type CommandFormTarget
} from './command-form';

/*
 * An outing idea changed from a form (docs/dev/02 §2.27). The person's Outings card and the
 * household's list of ideas post these commands (docs/dev/04 §4.11.2) and answer the same way.
 * Visibility and the when are read the way the outbox's `toCommand` reads them.
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

/** Which field names which mistake. */
const PLAN_FORM: CommandFormEdge = {
	fieldErrors: {
		title: 'errors.plan.needTitle',
		url: 'errors.plan.badLink',
		when: 'errors.plan.badWhen'
	},
	couldNotSave: 'errors.plan.couldNotSave',
	isGone: (error) => error instanceof PlanGoneError
};

/** Whose idea it is, and where the member lands once it worked. */
export type PlanTarget = CommandFormTarget;

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
	const planId = textOf(form, 'planId');
	// A row's error is shown on its row, so it says which idea it is about.
	const failure = (message: string, status: number) =>
		fail(
			status,
			errorKey === 'planRowError'
				? { planRowError: { planId, message } }
				: errorKey === 'planTickError'
					? { planTickError: message }
					: { planError: message }
		);
	return applyCommandFromForm(locals, form, type, payload, PLAN_FORM, target, failure);
}
