import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { openIdeaCount, splitPlans } from '../../plans/card';
import { comingUpFirst, comingUpRows, homePlans } from '../../plans/home';
import type { Clock } from '../clock';
import {
	addPlan,
	answerPlanWhen,
	editPlan,
	listOpenPlans,
	listPlansForContact,
	PlanGoneError,
	removePlan
} from '../domain/plans/plans';
import { bookPlan, donePlan, reopenPlan, unbookPlan } from '../domain/plans/progress';
import type { IdGenerator } from '../id';
import { createDrizzleContactRepository } from './contact-repository';
import { createPlanServices } from '../services/plans';
import * as schema from './schema';

/*
 * Every way an outing idea kept from someone could still reach them (docs/dev/02 §2.27): the
 * card's list, its counter, Home's *Coming up* and its folded line, and each command a phone may send (the plan.* handlers pass
 * the payload straight to these), each against the real adapter.
 * An idea kept from a member, or private to another, answers as one that is not there.
 */

const H = 'household-1';
const ANDY = { userId: 'andy', householdId: H };
const JULIA = { userId: 'julia', householdId: H };
const TODAY = '2026-11-17';

const clock: Clock = { now: () => Date.UTC(2026, 10, 17, 9) };
let next = 0;
const ids: IdGenerator = { next: () => `id-${++next}` };

let db: BunSQLiteDatabase<typeof schema>;
let services: ReturnType<typeof createPlanServices>;

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user)
		.values([
			{ id: 'andy', householdId: H, email: 'a@x.test', name: 'Andy' },
			{ id: 'julia', householdId: H, email: 'j@x.test', name: 'Julia' }
		])
		.run();
	db.insert(schema.contact)
		.values({
			id: 'julia-self',
			householdId: H,
			createdBy: 'andy',
			visibility: 'shared',
			displayName: 'Julia'
		})
		.run();
	db.update(schema.user)
		.set({ selfContactId: 'julia-self' })
		.where(eq(schema.user.id, 'julia'))
		.run();
	services = createPlanServices({ db, clock, ids, contacts: createDrizzleContactRepository(db) });
});

const viewer = (actor: typeof ANDY) => ({ id: actor.userId, householdId: actor.householdId });

async function noted(over: { hiddenFromPerson?: boolean; visibility?: 'shared' | 'private' }) {
	const { planId } = await addPlan(services.planDeps, ANDY, {
		contactId: 'julia-self',
		title: 'Surprise trip to the sea',
		note: null,
		url: null,
		visibility: over.visibility ?? 'shared',
		hiddenFromPerson: over.hiddenFromPerson ?? false,
		when: { kind: 'on_date', on: '2026-11-21' }
	});
	return planId;
}

type Kept = Parameters<typeof noted>[0];

describe.each<[string, Kept]>([
	['kept from the member it is with', { hiddenFromPerson: true }],
	['private to its author', { visibility: 'private' }]
])('an idea %s', (_name, over) => {
	it('is not on their card, and not in its count', async () => {
		await noted(over);
		const list = await listPlansForContact(services.planDeps, viewer(JULIA), 'julia-self');
		expect(list).toEqual([]);
		expect(openIdeaCount(splitPlans(list, null, TODAY).open)).toBe(0);
		// Its author still has it.
		const own = await listPlansForContact(services.planDeps, viewer(ANDY), 'julia-self');
		expect(openIdeaCount(splitPlans(own, null, TODAY).open)).toBe(1);
	});

	it.each([
		['plan.book', bookPlan],
		['plan.unbook', unbookPlan],
		['plan.done', donePlan],
		['plan.reopen', reopenPlan],
		['plan.remove', removePlan]
	] as const)('answers %s from them as gone, and leaves it as it was', async (_type, step) => {
		const planId = await noted(over);
		const before = db.select().from(schema.activityIdea).all();
		await expect(
			step(services.planDeps, JULIA, { contactId: 'julia-self', planId })
		).rejects.toBeInstanceOf(PlanGoneError);
		expect(db.select().from(schema.activityIdea).all()).toEqual(before);
	});

	it('is not on their Home, nor in its date line count', async () => {
		await noted(over);
		await addPlan(services.planDeps, ANDY, {
			contactId: 'julia-self',
			title: 'Some time, kept the same way',
			note: null,
			url: null,
			visibility: over.visibility ?? 'shared',
			hiddenFromPerson: over.hiddenFromPerson ?? false
		});
		const open = await listOpenPlans(services.planDeps, viewer(JULIA));
		const home = homePlans(open, new Set(['julia-self']), TODAY);
		expect([home.asking, home.coming, home.lines.size]).toEqual([[], [], 0]);
		// Its author still has it, but the folded line never names it.
		const own = homePlans(
			await listOpenPlans(services.planDeps, viewer(ANDY)),
			new Set(['julia-self']),
			TODAY
		);
		expect(own.coming.map((row) => row.plan.title)).toEqual(['Surprise trip to the sea']);
		expect(own.lines.get('julia-self')?.undated).toBe(1);
		expect(comingUpFirst(comingUpRows([], own.asking, own.coming))).toBeNull();
	});

	it('answers a passed one from them as gone, and leaves it as it was', async () => {
		const planId = await noted(over);
		const before = db.select().from(schema.activityIdea).all();
		await expect(
			answerPlanWhen(services.planDeps, JULIA, { contactId: 'julia-self', planId, when: null })
		).rejects.toBeInstanceOf(PlanGoneError);
		expect(db.select().from(schema.activityIdea).all()).toEqual(before);
	});

	it('answers an edit from them as gone', async () => {
		const planId = await noted(over);
		await expect(
			editPlan(services.planDeps, JULIA, {
				contactId: 'julia-self',
				planId,
				title: 'Seen it',
				note: null,
				url: null,
				visibility: 'shared'
			})
		).rejects.toBeInstanceOf(PlanGoneError);
	});
});
