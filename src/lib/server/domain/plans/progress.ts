import { todayFor } from '../../../dates/today';
import { requireVisiblePlan, type PlanActor, type PlanDeps, type PlanRef } from './plans';

/*
 * An outing idea's way to done (docs/dev/02 §2.27): booked once a date is fixed, ticked off once
 * done, each undoable. Booking and ticking are idempotent — who did it first keeps the credit —
 * so one held on a phone and sent twice is harmless (docs/dev/04 §4.11.2).
 */

type Deps = Pick<PlanDeps, 'plans' | 'clock'>;

/** Fix an idea: it leaves the open ideas and stays on the card until done. */
export async function bookPlan(deps: Deps, actor: PlanActor, ref: PlanRef) {
	const plan = await requireVisiblePlan(deps, actor, ref);
	if (plan.bookedAt !== null || plan.doneAt !== null) return { planId: plan.id };
	const now = deps.clock.now();
	await deps.plans.update({ ...plan, bookedAt: now, bookedBy: actor.userId, updatedAt: now });
	return { planId: plan.id };
}

/** Back to an idea: the date fell through. */
export async function unbookPlan(deps: Deps, actor: PlanActor, ref: PlanRef) {
	const plan = await requireVisiblePlan(deps, actor, ref);
	if (plan.bookedAt === null) return { planId: plan.id };
	await deps.plans.update({
		...plan,
		bookedAt: null,
		bookedBy: null,
		updatedAt: deps.clock.now()
	});
	return { planId: plan.id };
}

/** Tick it off as done, on the household's day; booked or not. */
export async function donePlan(deps: Deps, actor: PlanActor, ref: PlanRef) {
	const plan = await requireVisiblePlan(deps, actor, ref);
	if (plan.doneAt !== null) return { planId: plan.id };
	const now = deps.clock.now();
	await deps.plans.update({
		...plan,
		doneAt: now,
		doneOn: todayFor(deps.clock),
		doneBy: actor.userId,
		updatedAt: now
	});
	return { planId: plan.id };
}

/** Open a done idea again — the toast's *Undo*, or a mistaken tick; a booking stays. */
export async function reopenPlan(deps: Deps, actor: PlanActor, ref: PlanRef) {
	const plan = await requireVisiblePlan(deps, actor, ref);
	if (plan.doneAt === null) return { planId: plan.id };
	await deps.plans.update({
		...plan,
		doneAt: null,
		doneOn: null,
		doneBy: null,
		updatedAt: deps.clock.now()
	});
	return { planId: plan.id };
}
