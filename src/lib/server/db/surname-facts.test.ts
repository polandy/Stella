import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import * as schema from './schema';
import { createDrizzleSurnameFacts } from './surname-facts';

/*
 * Integration spec for what the last-name rules read (docs/concepts/surnames.md §4): only what
 * the viewer may see, archived people included, and only circles of the family kind.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const viewer: Viewer = { id: U1, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;

const person = (id: string, over: Partial<typeof schema.contact.$inferInsert> = {}) => ({
	id,
	householdId: H,
	createdBy: U1,
	displayName: id,
	...over
});

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
			person('peter', { lastName: 'Brunner', formerName: 'Keller' }),
			person('oma', { lastName: 'Huber', archivedAt: 5, isDeceased: 1 }),
			person('secret', { createdBy: U2, visibility: 'private', lastName: 'Hidden' })
		])
		.run();
	db.insert(schema.circle)
		.values([
			{ id: 'fam', householdId: H, createdBy: U1, name: 'Familie Brunner', kind: 'family' },
			{ id: 'club', householdId: H, createdBy: U1, name: 'Club', kind: 'club' }
		])
		.run();
	db.insert(schema.circleMembership)
		.values([
			{ id: 'm1', circleId: 'fam', contactId: 'peter', createdBy: U1 },
			{ id: 'm2', circleId: 'fam', contactId: 'secret', createdBy: U2 },
			{ id: 'm3', circleId: 'club', contactId: 'peter', createdBy: U1 }
		])
		.run();
});

describe('loadSurnameFactsVisibleTo', () => {
	it('reads every visible person, archived ones too, with what the rules need', async () => {
		const { people } = await createDrizzleSurnameFacts(db).loadSurnameFactsVisibleTo(viewer);
		expect(people.map((p) => p.id).sort()).toEqual(['oma', 'peter']);
		expect(people.find((p) => p.id === 'oma')).toMatchObject({
			archived: true,
			isDeceased: true,
			lastName: 'Huber'
		});
		expect(people.find((p) => p.id === 'peter')).toMatchObject({
			archived: false,
			formerName: 'Keller'
		});
	});

	it('reads family circles only, with their visible members', async () => {
		const { familyCircles } = await createDrizzleSurnameFacts(db).loadSurnameFactsVisibleTo(viewer);
		expect(familyCircles).toEqual([{ id: 'fam', name: 'Familie Brunner', memberIds: ['peter'] }]);
	});
});
