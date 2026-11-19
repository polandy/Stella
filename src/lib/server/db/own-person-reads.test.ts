import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { createDrizzleOwnPersonReads } from './own-person-reads';
import * as schema from './schema';

/*
 * The Drizzle OwnPersonReads (docs/dev/03 §3.7): a person is a member's own only while that member
 * is a current one of the household.
 */

const H = 'household-1';
const ANDY = 'user-andy';
const JULIA = 'user-julia';
/** Julia's own person. */
const JULIA_PERSON = 'c-julia';

let db: BunSQLiteDatabase<typeof schema>;
let reads: ReturnType<typeof createDrizzleOwnPersonReads>;

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user)
		.values([
			{ id: ANDY, householdId: H, email: 'a@x.test', name: 'Andy' },
			{ id: JULIA, householdId: H, email: 'j@x.test', name: 'Julia' }
		])
		.run();
	db.insert(schema.contact)
		.values([
			{ id: JULIA_PERSON, householdId: H, createdBy: ANDY, displayName: 'Julia' },
			{ id: 'c-hilde', householdId: H, createdBy: ANDY, displayName: 'Hilde' }
		])
		.run();
	db.update(schema.user)
		.set({ selfContactId: JULIA_PERSON })
		.where(eq(schema.user.id, JULIA))
		.run();
	reads = createDrizzleOwnPersonReads(db);
});

describe('memberWhoseOwnPerson', () => {
	it('names the current member whose own person it is, and nobody for anyone else', async () => {
		expect(await reads.memberWhoseOwnPerson(H, JULIA_PERSON)).toBe(JULIA);
		expect(await reads.memberWhoseOwnPerson(H, 'c-hilde')).toBeNull();
		expect(await reads.memberWhoseOwnPerson('household-2', JULIA_PERSON)).toBeNull();
	});

	it('names nobody once that member is removed', async () => {
		db.update(schema.user).set({ removedAt: 5 }).where(eq(schema.user.id, JULIA)).run();
		expect(await reads.memberWhoseOwnPerson(H, JULIA_PERSON)).toBeNull();
	});
});

describe('membersOwnPeople', () => {
	it('lists the current members who have an own person, and no one once removed', async () => {
		expect(await reads.membersOwnPeople(H)).toEqual([{ memberId: JULIA, contactId: JULIA_PERSON }]);
		expect(await reads.membersOwnPeople('household-2')).toEqual([]);
		db.update(schema.user).set({ removedAt: 5 }).where(eq(schema.user.id, JULIA)).run();
		expect(await reads.membersOwnPeople(H)).toEqual([]);
	});
});
