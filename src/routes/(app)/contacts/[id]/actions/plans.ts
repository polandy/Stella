import { fromFormData } from '$lib/commands/form-data';
import { PlanAddSchema, PlanEditSchema, PlanRefSchema } from '$lib/commands/plan-payloads';
import { contactSectionPath } from '$lib/people/sections';
import type { RequestEvent } from '@sveltejs/kit';
import {
	applyPlanCommand,
	planVisibilityOf,
	planWhenOf,
	type PlanCommand,
	type PlanErrorKey
} from '../../../_shared/plan-commands';
import type { Actions } from '../$types';

/*
 * The Outings card (docs/dev/02 §2.27). Every change is a command (docs/dev/04 §4.11.2): noting,
 * booking and ticking an idea may wait on a phone like any addition; rewriting, undoing a booking
 * or a tick and removing one go straight to Stella.
 */

/** One outing command on the person the URL names, back to their Outings card when it worked. */
const onCard = async (
	{
		params,
		locals,
		request
	}: Pick<RequestEvent, 'locals' | 'request'> & { params: { id: string } },
	type: PlanCommand,
	payloadOf: (form: FormData) => Record<string, unknown>,
	errorKey: PlanErrorKey
) => {
	const form = await request.formData();
	return applyPlanCommand(locals, form, type, payloadOf(form), errorKey, {
		contactId: params.id,
		back: contactSectionPath(params.id, 'plans')
	});
};

const ref = (form: FormData) => fromFormData(PlanRefSchema, form);

export const planActions = {
	addPlan: (event) =>
		onCard(
			event,
			'plan.add',
			(form) => ({
				...fromFormData(PlanAddSchema, form),
				...planVisibilityOf(form),
				when: planWhenOf(form)
			}),
			'planError'
		),
	editPlan: (event) =>
		onCard(
			event,
			'plan.edit',
			(form) => ({
				...fromFormData(PlanEditSchema, form),
				...planVisibilityOf(form),
				when: planWhenOf(form)
			}),
			'planRowError'
		),
	bookPlan: (event) => onCard(event, 'plan.book', ref, 'planTickError'),
	unbookPlan: (event) => onCard(event, 'plan.unbook', ref, 'planRowError'),
	donePlan: (event) => onCard(event, 'plan.done', ref, 'planTickError'),
	reopenPlan: (event) => onCard(event, 'plan.reopen', ref, 'planRowError'),
	removePlan: (event) => onCard(event, 'plan.remove', ref, 'planRowError')
} satisfies Actions;
