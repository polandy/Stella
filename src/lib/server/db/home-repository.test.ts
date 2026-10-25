import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { eq } from 'drizzle-orm';
import type { Viewer } from '../access/visibility';
import type { HomeChange } from '../domain/homes/homes';
import * as schema from './schema';
import { createDrizzleHomeReads, createDrizzleHomeRepository } from './home-repository';

/*
 * Integration spec for the home adapters: a home is reached only through a member the viewer
 * may see, names only the members they may see, applies a change in one transaction, and goes
 * with its last member however they leave (docs/03 §3.3).
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const u1: Viewer = { id: U1, householdId: H };
const u2: Viewer = { id: U2, householdId: H };

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleHomeRepository>;
let reads: ReturnType<typeof createDrizzleHomeReads>;

const change = (over: Partial<HomeChange>): HomeChange => ({
	create: null,
	update: null,
	dropFields: [],
	addFields: [],
	join: [],
	leave: [],
	...over
});

const homeIds = () =>
	db
		.select({ id: schema.home.id })
		.from(schema.home)
		.all()
		.map((h) => h.id);

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
			{ id: 'tim', householdId: H, createdBy: U1, displayName: 'Tim Brunner' },
			{ id: 'anna', householdId: H, createdBy: U1, displayName: 'Anna Brunner' },
			// Private to user-1: user-2 never sees her, nor that she lives there.
			{ id: 'lena', householdId: H, createdBy: U1, visibility: 'private', displayName: 'Lena' }
		])
		.run();
	db.insert(schema.home)
		.values({ id: 'home-1', householdId: H, label: 'Home', value: 'Lindenweg 4', createdBy: U1 })
		.run();
	db.insert(schema.homeMember)
		.values(['tim', 'anna', 'lena'].map((contactId) => ({ homeId: 'home-1', contactId, createdBy: U1 })))
		.run();
	db.insert(schema.contactField)
		.values({ id: 'f-anna', contactId: 'anna', kind: 'address', label: 'Work', value: 'Seeweg 9' })
		.run();
	repo = createDrizzleHomeRepository(db);
	reads = createDrizzleHomeReads(db);
});

describe('HomeReads', () => {
	it('names whom the person lives with, only the people the viewer may see', async () => {
		expect(await reads.listForContactVisibleTo(u1, 'tim')).toEqual([
			{
				id: 'home-1',
				label: 'Home',
				value: 'Lindenweg 4',
				livesWith: [
					{ id: 'anna', displayName: 'Anna Brunner' },
					{ id: 'lena', displayName: 'Lena' }
				]
			}
		]);
		expect(await reads.listForContactVisibleTo(u2, 'tim')).toEqual([
			{
				id: 'home-1',
				label: 'Home',
				value: 'Lindenweg 4',
				livesWith: [{ id: 'anna', displayName: 'Anna Brunner' }]
			}
		]);
	});

	it('shows nothing of a person the viewer may not see', async () => {
		expect(await reads.listForContactVisibleTo(u2, 'lena')).toEqual([]);
	});

	it('reads a home with nobody else in it', async () => {
		db.delete(schema.homeMember).where(eq(schema.homeMember.contactId, 'anna')).run();
		db.delete(schema.homeMember).where(eq(schema.homeMember.contactId, 'lena')).run();
		expect((await reads.listForContactVisibleTo(u1, 'tim'))[0].livesWith).toEqual([]);
	});
});

describe('HomeRepository', () => {
	it('finds a home through a member the viewer may see, and says who of them they see', async () => {
		const found = await repo.findForMemberVisibleTo(u2, 'home-1', 'tim');
		expect(found?.members.sort((a, b) => a.contactId.localeCompare(b.contactId))).toEqual([
			{ contactId: 'anna', visible: true },
			{ contactId: 'lena', visible: false },
			{ contactId: 'tim', visible: true }
		]);
		expect(await repo.findForMemberVisibleTo(u2, 'home-1', 'lena')).toBeNull();
	});

	it('lists every address someone has, own fields and homes', async () => {
		expect(await repo.addressesOf(['anna'])).toEqual([
			{ contactId: 'anna', source: 'field', id: 'f-anna', label: 'Work', value: 'Seeweg 9', meta: null },
			{ contactId: 'anna', source: 'home', id: 'home-1', label: 'Home', value: 'Lindenweg 4', meta: null }
		]);
	});

	it('applies a change in one go: a new home, a field dropped, people joining', async () => {
		await repo.apply(
			change({
				create: {
					id: 'home-2',
					householdId: H,
					label: null,
					value: 'Seeweg 9',
					meta: null,
					createdBy: U1,
					createdAt: 1,
					updatedAt: 1
				},
				dropFields: [{ contactId: 'anna', fieldId: 'f-anna' }],
				join: [{ homeId: 'home-2', contactId: 'anna', createdBy: U1, createdAt: 1 }]
			})
		);
		expect(homeIds().sort()).toEqual(['home-1', 'home-2']);
		expect(db.select().from(schema.contactField).all()).toEqual([]);
	});

	it('writes nothing when one step of a change fails', async () => {
		const failing = repo.apply(
			change({
				dropFields: [{ contactId: 'anna', fieldId: 'f-anna' }],
				join: [{ homeId: 'home-missing', contactId: 'anna', createdBy: U1, createdAt: 1 }]
			})
		);
		expect(failing).rejects.toThrow();
		expect(db.select().from(schema.contactField).all()).toHaveLength(1);
	});

	it('deletes a home with its last member', async () => {
		await repo.apply(
			change({
				leave: ['tim', 'anna', 'lena'].map((contactId) => ({ homeId: 'home-1', contactId }))
			})
		);
		expect(homeIds()).toEqual([]);
	});

	it('deletes a home when its last member is deleted', () => {
		for (const id of ['tim', 'anna', 'lena']) {
			db.delete(schema.contact).where(eq(schema.contact.id, id)).run();
		}
		expect(homeIds()).toEqual([]);
	});

	it('keeps a home while anyone still lives there', () => {
		db.delete(schema.contact).where(eq(schema.contact.id, 'tim')).run();
		expect(homeIds()).toEqual(['home-1']);
	});
});
