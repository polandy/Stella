/*
 * How the person page's Outings card stands (docs/dev/02 §2.27, docs/dev/05 §5.5). Pure, so how its
 * lists are divided and ordered is tested without a browser; the card only renders.
 */

import type { PartialDate } from '../dates/partial-date';
import { whenDay } from '../when/resolve';
import { dayOfInstant } from '../dates/today';
import { whenState, type WhenState } from '../when/state';
import type { When } from '../when/when';

/** What an open idea's place hangs on. */
export interface OpenPlanTiming {
	when: When | null;
	bookedAt: number | null;
	createdAt: number;
}

/** What the card needs to know of an idea, open or done, to place it. */
export interface PlanTiming extends OpenPlanTiming {
	doneOn: string | null;
}

/** The card's two tabs: what is still to do, and what was done. */
export type PlanTab = 'ideas' | 'done';

// '~' sorts after every ISO day by code point, so *some time* comes last.
const dayOf = (plan: PlanTiming, birth: PartialDate | null) =>
	plan.when ? (whenDay(plan.when, birth)?.on ?? '~') : '~';

/**
 * The open ideas, the ones folded under *Later* (more than `WHEN_LEAD_DAYS` ahead) and the done
 * ones. Open and later run soonest first, *some time* last and newest first among them; done runs
 * newest first. A booked idea is never folded: it is fixed, and stays in view until done.
 */
export function splitPlans<T extends PlanTiming>(
	plans: readonly T[],
	birth: PartialDate | null,
	today: string
): { open: T[]; later: T[]; done: T[] } {
	const open: T[] = [];
	const later: T[] = [];
	const done: T[] = [];
	for (const plan of plans) {
		if (plan.doneOn !== null) done.push(plan);
		else if (plan.bookedAt === null && waits(plan, birth, today)) later.push(plan);
		else open.push(plan);
	}
	const soonest = (a: T, b: T) => {
		const [x, y] = [dayOf(a, birth), dayOf(b, birth)];
		return x < y ? -1 : x > y ? 1 : b.createdAt - a.createdAt;
	};
	open.sort(soonest);
	later.sort(soonest);
	done.sort((a, b) => (a.doneOn! < b.doneOn! ? 1 : a.doneOn! > b.doneOn! ? -1 : 0));
	return { open, later, done };
}

/** Where an idea stands against its when on `today`; null for one meant for *some time*. */
export function planState(
	plan: Pick<OpenPlanTiming, 'when' | 'createdAt'>,
	birth: PartialDate | null,
	today: string
): WhenState | null {
	if (plan.when === null) return null;
	const notedOn = dayOfInstant(plan.createdAt);
	return whenState(plan.when, { birth, notedOn, checkedOn: null }, today);
}

function waits(plan: PlanTiming, birth: PartialDate | null, today: string): boolean {
	return planState(plan, birth, today)?.kind === 'waiting';
}

/** How many ideas are still only ideas: a booked one is no longer one to choose from. */
export function openIdeaCount(open: readonly OpenPlanTiming[]): number {
	return open.filter((plan) => plan.bookedAt === null).length;
}
