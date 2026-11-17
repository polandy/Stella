import { fromFormData } from '$lib/commands/form-data';
import { PlanAnswerWhenSchema, PlanRefSchema } from '$lib/commands/plan-payloads';
import { requireViewer } from '$lib/server/auth/guards';
import { listOpenPlans, type OpenPlan } from '$lib/server/domain/plans/plans';
import { homePlans, type PlacedPlan } from '$lib/plans/home';
import type { RequestEvent } from '@sveltejs/kit';
import { applyPlanCommand, planWhenOf, type PlanCommand, type PlanErrorKey } from './plan-commands';

/*
 * The outing ideas on Home (docs/dev/02 §2.27.7): the dated ones mixed into *Coming up*, a passed
 * one asking for a week. Home has no person in its URL, so the form names them and the access
 * layer checks it, as for the household's to-dos (§2.26.6).
 */

/** An idea as Home's row needs it, and nothing more. */
export interface HomePlanView {
	id: string;
	contactId: string;
	contactName: string;
	avatarPhotoId: string | null;
	title: string;
	when: OpenPlan['when'];
	visibility: OpenPlan['visibility'];
	hiddenFromPerson: boolean;
}

const viewOf = ({ plan, on, approximate }: PlacedPlan<OpenPlan>) => ({
	on,
	approximate,
	plan: {
		id: plan.id,
		contactId: plan.contactId,
		contactName: plan.contactName,
		avatarPhotoId: plan.avatarPhotoId,
		title: plan.title,
		when: plan.when,
		visibility: plan.visibility,
		hiddenFromPerson: plan.hiddenFromPerson
	} satisfies HomePlanView
});

/** The ideas Home shows, placed against the people who have a date line in *Coming up*. */
export async function readHomePlans(
	locals: RequestEvent['locals'],
	withLine: readonly string[],
	today: string
) {
	const open = await listOpenPlans(locals.services.plans.planDeps, requireViewer(locals));
	const { asking, coming, lines } = homePlans(open, new Set(withLine), today);
	return {
		asking: asking.map(viewOf),
		coming: coming.map(viewOf),
		/** By person: the booked ideas' titles, and how many wait without a day. */
		lines: new Map(
			[...lines].map(([contactId, line]) => [
				contactId,
				{ booked: line.booked.map((plan) => plan.title), undated: line.undated }
			])
		)
	};
}

/** Ticking, its *Undo*, and the answers of a passed idea, on a page without a person, back to `back`. */
export function householdPlanActions(back: string) {
	const onRow =
		(
			type: PlanCommand,
			payloadOf: (form: FormData) => Record<string, unknown>,
			errorKey: PlanErrorKey
		) =>
		async ({ request, locals }: Pick<RequestEvent, 'request' | 'locals'>) => {
			const form = await request.formData();
			const contactId = form.get('contactId');
			return applyPlanCommand(locals, form, type, payloadOf(form), errorKey, {
				contactId: typeof contactId === 'string' ? contactId : '',
				back
			});
		};
	const ref = (form: FormData) => fromFormData(PlanRefSchema, form);
	return {
		donePlan: onRow('plan.done', ref, 'planTickError'),
		reopenPlan: onRow('plan.reopen', ref, 'planRowError'),
		answerPlanWhen: onRow(
			'plan.answerWhen',
			(form) => ({ ...fromFormData(PlanAnswerWhenSchema, form), when: planWhenOf(form) }),
			'planRowError'
		),
		removePlan: onRow('plan.remove', ref, 'planRowError')
	};
}
