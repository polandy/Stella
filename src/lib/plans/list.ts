/*
 * The household's list of open outing ideas, `/plans` (docs/dev/02 §2.27.9). Pure, so how the
 * ideas are grouped is tested without a database: *This month*, *Later*, *Some time*. What is more
 * than `WHEN_LEAD_DAYS` ahead waits behind *Show later ones too*, as on `/gifts`.
 */

import type { PartialDate } from '../dates/partial-date';
import { monthEnd, whenDay } from '../when/resolve';
import { planState, type PlanTiming } from './card';

/** An open idea as the list needs it: its timing and its person's birth date, for an age. */
export interface ListPlan extends PlanTiming {
	birth: PartialDate | null;
}

export type PlanGroupKey = 'thisMonth' | 'later' | 'someTime';

export interface PlanListGroup<T> {
	key: PlanGroupKey;
	plans: T[];
}

const GROUP_ORDER: readonly PlanGroupKey[] = ['thisMonth', 'later', 'someTime'];

/** Where an idea goes on `today`, and whether it waits behind *Show later ones too*. */
function placeOf(plan: ListPlan, today: string): { key: PlanGroupKey; on: string; folds: boolean } {
	const state = planState(plan, plan.birth, today);
	const day = plan.when && whenDay(plan.when, plan.birth);
	// An age reached holds from then on: like one without a birth year, it has no day left.
	if (!state || !day || (state.kind === 'due' && plan.when?.kind === 'from_age'))
		return { key: 'someTime', on: '', folds: false };
	if (state.kind === 'due' || state.kind === 'passed' || day.on <= monthEnd(today.slice(0, 7)))
		return { key: 'thisMonth', on: day.on, folds: false };
	return { key: 'later', on: day.on, folds: state.kind === 'waiting' && plan.bookedAt === null };
}

/**
 * The open ideas by group, an empty one left out; dated ones soonest first, *some time* newest
 * first. Unless `showLater`, the ideas still waiting are left out and `hidden` counts them.
 */
export function planListGroups<T extends ListPlan>(
	plans: readonly T[],
	today: string,
	showLater: boolean
): { groups: PlanListGroup<T>[]; hidden: number } {
	const placed = plans
		.filter((plan) => plan.doneOn === null)
		.map((plan) => ({ plan, ...placeOf(plan, today) }));
	const hidden = placed.filter((p) => p.folds).length;
	const shown = placed
		.filter((p) => showLater || !p.folds)
		.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : b.plan.createdAt - a.plan.createdAt));
	const groups = GROUP_ORDER.map((key) => ({
		key,
		plans: shown.filter((p) => p.key === key).map((p) => p.plan)
	})).filter((group) => group.plans.length > 0);
	return { groups, hidden };
}
