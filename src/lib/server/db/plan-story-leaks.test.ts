import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Clock } from '../clock';
import { addPlan, listPlansForContact } from '../domain/plans/plans';
import { donePlan } from '../domain/plans/progress';
import { linkPlanMoment } from '../domain/plans/afterwards';
import type { IdGenerator } from '../id';
import { createDrizzleContactRepository } from './contact-repository';
import { createPlanServices } from '../services/plans';
import * as schema from './schema';

/*
 * A done outing idea in a person's story and the moment written about it (docs/dev/02 §2.27.8),
 * against the real adapter: an idea kept from someone never reaches their story, and the link to
 * a moment only reaches whoever may see that moment too.
 */

const H = 'household-1';
const ANDY = { userId: 'andy', householdId: H };
const JULIA = { userId: 'julia', householdId: H };
const MIA = 'mia';

let now = Date.UTC(2026, 10, 17, 9);
const clock: Clock = { now: () => now };
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
		.values([
			{
				id: 'julia-self',
				householdId: H,
				createdBy: 'andy',
				visibility: 'shared',
				displayName: 'Julia'
			},
			{ id: MIA, householdId: H, createdBy: 'andy', visibility: 'shared', displayName: 'Mia' }
		])
		.run();
	db.update(schema.user)
		.set({ selfContactId: 'julia-self' })
		.where(eq(schema.user.id, 'julia'))
		.run();
	services = createPlanServices({ db, clock, ids, contacts: createDrizzleContactRepository(db) });
});

const viewer = (actor: typeof ANDY) => ({ id: actor.userId, householdId: actor.householdId });
const story = (
	actor: typeof ANDY,
	contactId: string,
	before?: { doneOn: string; doneAt: number }
) =>
	services.planDeps.plans.listStoryPageForContactVisibleTo(viewer(actor), contactId, {
		limit: 10,
		before
	});

async function doneIdea(
	over: { contactId?: string; hiddenFromPerson?: boolean; visibility?: 'shared' | 'private' } = {}
) {
	const contactId = over.contactId ?? MIA;
	const { planId } = await addPlan(services.planDeps, ANDY, {
		contactId,
		title: 'Climbing hall',
		note: null,
		url: null,
		visibility: over.visibility ?? 'shared',
		hiddenFromPerson: over.hiddenFromPerson ?? false
	});
	await donePlan(services.planDeps, ANDY, { contactId, planId });
	return { contactId, planId };
}

function moment(id: string, visibility: 'shared' | 'private', contactId = MIA) {
	db.insert(schema.journalEntry)
		.values({
			id,
			contactId,
			createdBy: 'andy',
			visibility,
			entryDate: '2026-11-17',
			subjectKey: `${contactId}:${id}`,
			body: 'We climbed'
		})
		.run();
}

describe('a done idea in the story', () => {
	it('stands there on the day it was ticked, latest first, and pages', async () => {
		const first = await doneIdea();
		now += 1000;
		const second = await doneIdea();
		const page = await story(JULIA, MIA);
		expect(page.map((p) => p.id)).toEqual([second.planId, first.planId]);
		expect(page[0]).toMatchObject({ doneOn: '2026-11-17', doneBy: 'andy' });
		const older = await story(JULIA, MIA, { doneOn: page[0].doneOn, doneAt: page[0].doneAt });
		expect(older.map((p) => p.id)).toEqual([first.planId]);
	});

	it('leaves an open idea out', async () => {
		await addPlan(services.planDeps, ANDY, {
			contactId: MIA,
			title: 'Zoo',
			note: null,
			url: null,
			visibility: 'shared'
		});
		expect(await story(ANDY, MIA)).toEqual([]);
	});

	it.each([
		['kept from the member it is with', { contactId: 'julia-self', hiddenFromPerson: true }],
		['private to its author', { visibility: 'private' as const }]
	])('never reaches anybody it is %s', async (_name, over) => {
		const { contactId } = await doneIdea(over);
		expect(await story(JULIA, contactId)).toEqual([]);
		expect((await story(ANDY, contactId)).length).toBe(1);
	});
});

describe('the moment linked to a done idea', () => {
	it('is linked for whoever may see the moment', async () => {
		const ref = await doneIdea();
		moment('entry-1', 'shared');
		await linkPlanMoment(services.planDeps, ANDY, { ...ref, momentId: 'entry-1' });
		expect((await story(JULIA, MIA))[0].momentId).toBe('entry-1');
		const card = await listPlansForContact(services.planDeps, viewer(JULIA), MIA);
		expect(card[0].momentId).toBe('entry-1');
	});

	it('is not named to a member who may not see the moment, on the story or the card', async () => {
		const ref = await doneIdea();
		moment('entry-1', 'private');
		await linkPlanMoment(services.planDeps, ANDY, { ...ref, momentId: 'entry-1' });
		expect((await story(JULIA, MIA))[0].momentId).toBeNull();
		const card = await listPlansForContact(services.planDeps, viewer(JULIA), MIA);
		expect(card[0].momentId).toBeNull();
		// Its author still has the link.
		expect((await story(ANDY, MIA))[0].momentId).toBe('entry-1');
	});

	it('is not lost when a member who may not see the moment changes the idea', async () => {
		const ref = await doneIdea();
		moment('entry-1', 'private');
		await linkPlanMoment(services.planDeps, ANDY, { ...ref, momentId: 'entry-1' });
		const seen = await services.planDeps.plans.findVisibleTo(viewer(JULIA), MIA, ref.planId);
		await services.planDeps.plans.update({ ...seen!, title: 'Climbing hall, again' });
		expect((await story(ANDY, MIA))[0].momentId).toBe('entry-1');
	});

	it('goes when the moment is deleted, and the idea stays done', async () => {
		const ref = await doneIdea();
		moment('entry-1', 'shared');
		await linkPlanMoment(services.planDeps, ANDY, { ...ref, momentId: 'entry-1' });
		db.delete(schema.journalEntry).where(eq(schema.journalEntry.id, 'entry-1')).run();
		const [done] = await story(ANDY, MIA);
		expect(done).toMatchObject({ id: ref.planId, momentId: null, doneOn: '2026-11-17' });
	});
});
