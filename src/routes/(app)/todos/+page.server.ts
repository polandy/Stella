import { todayFor } from '$lib/dates/today';
import { systemClock } from '$lib/server/clock';
import { householdTodoActions, readHouseholdTodos } from '../_shared/household-todos';
import type { Actions, PageServerLoad } from './$types';

/*
 * Every open to-do of the household on one page (docs/02 §2.26.6), grouped by its day as Home's
 * band reads it. A to-do is ticked right here; rewriting and removing it stay on the person's
 * card.
 */

export const load: PageServerLoad = async ({ locals }) => ({
	today: todayFor(systemClock),
	todos: await readHouseholdTodos(locals)
});

export const actions = householdTodoActions('/todos') satisfies Actions;
