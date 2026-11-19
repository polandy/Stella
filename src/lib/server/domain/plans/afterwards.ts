import { viewerOf } from '../shared/idea-on-person';
import { addPlan, requireVisiblePlan, type PlanActor, type PlanDeps, type PlanRef } from './plans';

/*
 * What follows a done outing idea (docs/dev/02 §2.27.8): the moment written about it, linked to
 * it, and the idea noted again. Both go through `requireVisiblePlan`, so a private idea or a
 * surprise stays out of reach of whoever may not see it.
 */

/**
 * Link the moment just written about a done idea. The moment is saved by then, so an idea gone,
 * out of the writer's sight or opened again in the meantime is quietly left as it is.
 */
export async function linkPlanMoment(
	deps: Pick<PlanDeps, 'plans' | 'clock'>,
	actor: PlanActor,
	{ contactId, planId, momentId }: PlanRef & { momentId: string }
): Promise<void> {
	const plan = await deps.plans.findVisibleTo(viewerOf(actor), contactId, planId);
	if (!plan || plan.doneAt === null || plan.momentId === momentId) return;
	await deps.plans.update({ ...plan, momentId, updatedAt: deps.clock.now() });
}

/** Note a done idea again, for some time and with no date: a fresh idea, the done one kept. */
export async function againPlan(
	deps: PlanDeps,
	actor: PlanActor,
	ref: PlanRef
): Promise<{ planId: string }> {
	const plan = await requireVisiblePlan(deps, actor, ref);
	return addPlan(deps, actor, {
		contactId: plan.contactId,
		title: plan.title,
		note: plan.note,
		url: plan.url,
		visibility: plan.visibility,
		hiddenFromPerson: plan.hiddenFromPerson,
		when: null
	});
}
