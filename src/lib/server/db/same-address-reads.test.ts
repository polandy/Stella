import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import * as schema from './schema';
import { createDrizzleSameAddressSource } from './same-address-reads';

/*
 * Integration spec for what *Same address* reads (docs/02 §2.17): only people the viewer may
 * browse, their own lines, and the homes they live in naming only them — a private person of
 * another member, an archived person and another household never appear.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const u2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household)
		.values([
			{ id: H, name: 'H' },
			{ id: 'household-2', name: 'Other' }
		])
		.run();
	db.insert(schema.user)
		.values([
			{ id: U1, householdId: H, email: 'u1@x.test', name: 'One' },
			{ id: U2, householdId: H, email: 'u2@x.test', name: 'Two' },
			{ id: 'user-3', householdId: 'household-2', email: 'u3@x.test', name: 'Three' }
		])
		.run();
	db.insert(schema.contact)
		.values([
			{ id: 'anna', householdId: H, createdBy: U1, displayName: 'Anna' },
			{ id: 'tim', householdId: H, createdBy: U2, displayName: 'Tim' },
			{ id: 'mine', householdId: H, createdBy: U2, visibility: 'private', displayName: 'Mine' },
			{ id: 'lena', householdId: H, createdBy: U1, visibility: 'private', displayName: 'Lena' },
			{ id: 'old', householdId: H, createdBy: U1, displayName: 'Old', archivedAt: 5 },
			{ id: 'away', householdId: 'household-2', createdBy: 'user-3', displayName: 'Away' }
		])
		.run();
	db.insert(schema.contactField)
		.values(
			['tim', 'mine', 'lena', 'old', 'away'].map((contactId) => ({
				id: `f-${contactId}`,
				contactId,
				kind: 'address' as const,
				label: 'Home',
				value: 'Lindenweg 4'
			}))
		)
		.run();
	db.insert(schema.contactField)
		.values({ id: 'p-tim', contactId: 'tim', kind: 'phone', value: '044' })
		.run();
	db.insert(schema.home)
		.values([
			{ id: 'home-1', householdId: H, value: 'Lindenweg 4', createdBy: U1 },
			{ id: 'home-hidden', householdId: H, value: 'Seeweg 1', createdBy: U1 }
		])
		.run();
	db.insert(schema.homeMember)
		.values([
			{ homeId: 'home-1', contactId: 'anna', createdBy: U1 },
			{ homeId: 'home-1', contactId: 'lena', createdBy: U1 },
			{ homeId: 'home-hidden', contactId: 'lena', createdBy: U1 }
		])
		.run();
});

describe('the Same address source', () => {
	it('reads only the people the viewer may browse, their own lines and their homes', async () => {
		const facts = await createDrizzleSameAddressSource(db).loadVisibleTo(u2);
		expect(facts.people.map((p) => p.id).sort()).toEqual(['anna', 'mine', 'tim']);
		expect(facts.ownLines.map((l) => l.fieldId).sort()).toEqual(['f-mine', 'f-tim']);
		expect(facts.ownLines.find((l) => l.fieldId === 'f-tim')).toEqual({
			contactId: 'tim',
			fieldId: 'f-tim',
			value: 'Lindenweg 4',
			label: 'Home',
			meta: null
		});
		expect(facts.homes).toEqual([
			{ id: 'home-1', value: 'Lindenweg 4', livesHere: [{ id: 'anna', displayName: 'Anna' }] }
		]);
	});
});
