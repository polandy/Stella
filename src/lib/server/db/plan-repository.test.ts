import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import type { Plan } from '../domain/plans/plans';
import { createDrizzlePlanRepository } from './plan-repository';
import * as schema from './schema';

/*
 * Integration spec for the Drizzle PlanRepository (docs/dev/02 §2.27): an idea reads back as it
 * was stored, when and all; it reaches only those allowed to see it — a private one its author, one
 * on a private person that person's creator, a surprise never the member it is with (docs/dev/03
 * §3.7) — and the card's list holds open and done ones alike.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewerU1: Viewer = { id: U1, householdId: H };
const viewerU2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzlePlanRepository>;

function plan(over: Partial<Plan>): Plan {
	return {
		id: 'p',
		contactId: 'c-shared',
		createdBy: U1,
		visibility: 'shared',
		hiddenFromPerson: false,
		title: 'Climbing hall',
		note: null,
		url: null,
		when: null,
		bookedAt: null,
		bookedBy: null,
		doneAt: null,
		doneOn: null,
		doneBy: null,
		momentId: null,
		createdAt: 0,
		updatedAt: 0,
		...over
	};
}

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user)
		.values([
			{ id: U1, householdId: H, email: 'u1@x.test', name: 'One' },
			{ id: U2, householdId: H, email: 'u2@x.test', name: 'Two' }
		])
		.run();
	db.insert(schema.contact)
		.values([
			{ id: 'c-shared', householdId: H, createdBy: U1, visibility: 'shared', displayName: 'S' },
			{ id: 'c-priv', householdId: H, createdBy: U1, visibility: 'private', displayName: 'P' }
		])
		.run();
	repo = createDrizzlePlanRepository(db);
});

describe('createDrizzlePlanRepository', () => {
	it('reads an idea back as it was stored', async () => {
		const stored = plan({
			id: 'p-1',
			note: 'Shoes from the hall',
			url: 'https://example.test',
			when: { kind: 'in_month', on: '2026-12' },
			hiddenFromPerson: true,
			createdAt: 5,
			updatedAt: 6
		});
		await repo.insert(stored);
		expect(await repo.findVisibleTo(viewerU2, 'c-shared', 'p-1')).toEqual(stored);
	});

	it('finds an idea only on the person it belongs to', async () => {
		await repo.insert(plan({ id: 'p-1' }));
		expect(await repo.findVisibleTo(viewerU1, 'c-priv', 'p-1')).toBeNull();
	});

	it('shows a private idea to its author only', async () => {
		await repo.insert(plan({ id: 'p-1', visibility: 'private' }));
		expect(await repo.findVisibleTo(viewerU1, 'c-shared', 'p-1')).not.toBeNull();
		expect(await repo.findVisibleTo(viewerU2, 'c-shared', 'p-1')).toBeNull();
		expect(await repo.listForContactVisibleTo(viewerU2, 'c-shared')).toEqual([]);
	});

	it('shows nothing on a person the viewer cannot see', async () => {
		await repo.insert(plan({ id: 'p-1', contactId: 'c-priv' }));
		expect(await repo.findVisibleTo(viewerU2, 'c-priv', 'p-1')).toBeNull();
		expect(await repo.listForContactVisibleTo(viewerU2, 'c-priv')).toEqual([]);
		expect(await repo.listForContactVisibleTo(viewerU1, 'c-priv')).toHaveLength(1);
	});

	it('keeps a surprise from the member it is with, and from nobody else', async () => {
		db.update(schema.user).set({ selfContactId: 'c-shared' }).where(eq(schema.user.id, U2)).run();
		await repo.insert(plan({ id: 'p-1', hiddenFromPerson: true }));
		expect(await repo.findVisibleTo(viewerU2, 'c-shared', 'p-1')).toBeNull();
		expect(await repo.listForContactVisibleTo(viewerU2, 'c-shared')).toEqual([]);
		expect(await repo.findVisibleTo(viewerU1, 'c-shared', 'p-1')).not.toBeNull();
	});

	it('lists open and done ones, newest noted first', async () => {
		await repo.insert(plan({ id: 'old', createdAt: 1 }));
		await repo.insert(plan({ id: 'done', createdAt: 2, doneAt: 9, doneOn: '2026-11-01', doneBy: U2 }));
		await repo.insert(plan({ id: 'new', createdAt: 3 }));
		const listed = await repo.listForContactVisibleTo(viewerU1, 'c-shared');
		expect(listed.map((p) => p.id)).toEqual(['new', 'done', 'old']);
	});

	it('stores a booking, a tick, a rewrite and a removal', async () => {
		await repo.insert(plan({ id: 'p-1' }));
		const changed = plan({
			id: 'p-1',
			title: 'Zoo',
			when: { kind: 'on_date', on: '2026-11-21' },
			bookedAt: 7,
			bookedBy: U2,
			doneAt: 9,
			doneOn: '2026-11-21',
			doneBy: U2,
			updatedAt: 9
		});
		await repo.update(changed);
		expect(await repo.findVisibleTo(viewerU1, 'c-shared', 'p-1')).toEqual(changed);
		await repo.remove('p-1');
		expect(await repo.findVisibleTo(viewerU1, 'c-shared', 'p-1')).toBeNull();
	});

	it('names the member whose own person it is, and nobody for anyone else', async () => {
		db.update(schema.user).set({ selfContactId: 'c-shared' }).where(eq(schema.user.id, U2)).run();
		expect(await repo.memberWhoseOwnPerson(H, 'c-shared')).toBe(U2);
		expect(await repo.memberWhoseOwnPerson(H, 'c-priv')).toBeNull();
	});
});
