import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as schema from './schema';
import { createDrizzleMemberRepository } from './member-repository';

/*
 * Integration spec for the Drizzle MemberRepository: one household's members, never another's.
 */

const H = 'household-1';
const OTHER = 'household-2';

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleMemberRepository>;

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values([
		{ id: H, name: 'Ours' },
		{ id: OTHER, name: 'Theirs' }
	]).run();
	db.insert(schema.user).values([
		{ id: 'u1', householdId: H, email: 'u1@x.test', name: 'Markus Brunner' },
		{ id: 'u2', householdId: H, email: 'u2@x.test', name: 'Lena Brunner' },
		{ id: 'u9', householdId: OTHER, email: 'u9@x.test', name: 'Somebody Else' }
	]).run();
	repo = createDrizzleMemberRepository(db);
});

describe('members', () => {
	it('lists the household in a stable order, by name', async () => {
		expect(await repo.listMembers(H)).toEqual([
			{ id: 'u2', name: 'Lena Brunner' },
			{ id: 'u1', name: 'Markus Brunner' }
		]);
	});

	it('never lists a member of another household', async () => {
		const ours = await repo.listMembers(H);

		// positive control: the other household has its own member, and it is not in ours
		expect(await repo.listMembers(OTHER)).toEqual([{ id: 'u9', name: 'Somebody Else' }]);
		expect(ours.map((m) => m.id)).not.toContain('u9');
	});
});
