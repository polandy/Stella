import { todayFor } from '#lib/dates/today.js';
import { systemClock } from '#lib/server/clock.js';
import { householdPlanActions, readHouseholdPlans } from '../_shared/household-plans';
import type { Actions, PageServerLoad } from './$types';

/*
 * Every open outing idea of the household on one page (docs/dev/02 §2.27.9), grouped by when it
 * comes. An idea is ticked done right here; everything else about it stays on the person's card.
 */

export const load: PageServerLoad = async ({ locals }) => ({
	today: todayFor(systemClock),
	plans: await readHouseholdPlans(locals)
});

export const actions = householdPlanActions('/plans') satisfies Actions;
