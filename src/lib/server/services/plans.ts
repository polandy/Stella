import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { Clock } from '../clock';
import { createDrizzlePlanRepository } from '../db/plan-repository';
import type * as schema from '../db/schema';
import type { PlanDeps } from '../domain/plans/plans';
import type { IdGenerator } from '../id';

/*
 * The `plans` bounded context of the composition root (docs/dev/08 §8.3): what the household wants
 * to do with a person (docs/dev/02 §2.27). Built once per process by `createServices`; the edge
 * reads it off `locals.services.plans`.
 */
export interface PlanServices {
	planDeps: PlanDeps;
}

export interface PlanWiring {
	db: BunSQLiteDatabase<typeof schema>;
	clock: Clock;
	ids: IdGenerator;
	/** Whom an idea may be noted on; the people context owns the repository. */
	contacts: PlanDeps['contacts'];
}

export function createPlanServices({ db, clock, ids, contacts }: PlanWiring): PlanServices {
	return { planDeps: { plans: createDrizzlePlanRepository(db), contacts, ids, clock } };
}
