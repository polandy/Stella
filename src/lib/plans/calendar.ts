/*
 * An outing idea in the member's subscribed calendar (docs/dev/02 §2.27.11). Not a calendar of
 * outings: one entry when the idea's time starts to draw near, so the phone says *think of the
 * zoo* while there is still time to plan — never a second entry on the day itself.
 */

import { addDays } from '../dates/month';
import type { PartialDate } from '../dates/partial-date';
import { todayFor } from '../dates/today';
import { WHEN_LEAD_DAYS, whenDay } from '../when/resolve';
import { planState, type PlanTiming } from './card';

/**
 * The day an open idea's entry stands on: `WHEN_LEAD_DAYS` before its day, or the day it was
 * noted if that came later. Fixed once set, so the entry never moves. None for *some time*, a day
 * gone by, an age reached or unknown, an estimated year, or a done idea.
 */
export function planLeadDay(
	plan: PlanTiming,
	birth: PartialDate | null,
	today: string
): string | null {
	if (plan.doneOn !== null || plan.when === null || plan.bookedAt !== null) return null;
	const state = planState(plan, birth, today);
	const day = whenDay(plan.when, birth);
	if (!state || !day || day.approximate || state.kind === 'passed') return null;
	// An age reached holds from then on: there is no day left to stand before.
	if (plan.when.kind === 'from_age' && state.kind === 'due') return null;
	const lead = addDays(day.on, -WHEN_LEAD_DAYS);
	const noted = todayFor({ now: () => plan.createdAt });
	return lead > noted ? lead : noted;
}
