import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { asc, eq } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { ActivityWording } from '../domain/activity/activity';
import { importViaApi, type ApiImportDeps } from '../domain/import/api/api-import';
import type { ApiImportDocument, ApiNewPerson } from '../domain/import/api/document';
import { createDrizzleApiImportRepository } from './api-import-repository';
import * as schema from './schema';
import { seedRelationshipTypes } from './seed';

/*
 * Integration spec for homes in the import API (docs/02 §2.16.1): the homes a named person
 * lives in are read, and a home made of somebody's address, its residents and the own lines
 * that give way land in the same transaction as the rest — once, however often it is sent.
 */

const H = 'household-1';
const U1 = 'user-1';
const NOW = 1_700_000_000_000;
const actor = { userId: U1, householdId: H, defaultVisibility: 'shared' as const };
const wording: ActivityWording = {
	restored: () => 'not an import',
	imported: (_locale, { people, completed }) => `imported ${people}, completed ${completed}`
};

let db: BunSQLiteDatabase<typeof schema>;
let deps: ApiImportDeps;

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	seedRelationshipTypes(db);
	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user).values({ id: U1, householdId: H, email: 'u1@x.test', name: 'One' }).run();
	db.insert(schema.contact)
		.values({ id: 'c-anna', householdId: H, createdBy: U1, displayName: 'Anna Brunner' })
		.run();
	let seq = 0;
	deps = {
		imports: createDrizzleApiImportRepository(db, wording),
		clock: { now: () => NOW },
		ids: { next: () => `log-${++seq}` }
	};
});

const ownAddress = (id: string, contactId: string, value: string) =>
	db
		.insert(schema.contactField)
		.values({ id, contactId, kind: 'address', label: 'Home', value, meta: '{"city":"Bern"}' })
		.run();

const child = (ref: string, over: Partial<ApiNewPerson> = {}): ApiNewPerson => ({
	ref,
	displayName: null,
	firstName: ref,
	lastName: 'Brunner',
	nickname: null,
	description: null,
	birthDate: null,
	fields: [],
	home: { with: 'anna' },
	...over
});

const document = (people: ApiNewPerson[]): ApiImportDocument => ({
	source: 'kg',
	visibility: null,
	people: [{ ref: 'anna', existingId: 'c-anna', fields: [] }, ...people],
	relationships: [],
	circles: []
});

const run = (doc: ApiImportDocument) =>
	importViaApi(deps, actor, doc, { dryRun: false, locale: 'en' });

const homes = () => db.select().from(schema.home).all();
const residents = () =>
	db
		.select({ homeId: schema.homeMember.homeId, contactId: schema.homeMember.contactId })
		.from(schema.homeMember)
		.orderBy(asc(schema.homeMember.contactId))
		.all();
const addressesOf = (contactId: string) =>
	db
		.select({ id: schema.contactField.id })
		.from(schema.contactField)
		.where(eq(schema.contactField.contactId, contactId))
		.all()
		.map((f) => f.id);

describe('homes through the import API', () => {
	it('makes a home of a parent’s address and moves the children in, once', async () => {
		ownAddress('f-anna', 'c-anna', 'Lindenweg 4, 3000 Bern');
		const kids = document([child('tim'), child('mia')]);

		const first = await run(kids);
		expect(first).toMatchObject({ ok: true, added: { people: 2, homes: 1, residents: 3 } });
		expect(homes()).toEqual([
			{
				id: 'api~kg~h~anna',
				householdId: H,
				label: 'Home',
				value: 'Lindenweg 4, 3000 Bern',
				meta: '{"city":"Bern"}',
				createdBy: U1,
				createdAt: NOW,
				updatedAt: NOW
			}
		]);
		expect(residents()).toEqual([
			{ homeId: 'api~kg~h~anna', contactId: 'api~kg~p~mia' },
			{ homeId: 'api~kg~h~anna', contactId: 'api~kg~p~tim' },
			{ homeId: 'api~kg~h~anna', contactId: 'c-anna' }
		]);
		expect(addressesOf('c-anna')).toEqual([]);

		const again = await run(kids);
		expect(again).toMatchObject({
			ok: true,
			added: { people: 0, homes: 0, residents: 0 },
			report: { alreadyThere: { residents: 2 } }
		});
		expect(homes()).toHaveLength(1);
		expect(residents()).toHaveLength(3);
	});

	it('moves someone into the home a parent lives in, their same line giving way', async () => {
		db.insert(schema.home)
			.values({ id: 'h-1', householdId: H, value: 'Lindenweg 4, 3000 Bern', createdBy: U1 })
			.run();
		db.insert(schema.homeMember)
			.values({ homeId: 'h-1', contactId: 'c-anna', createdBy: U1 })
			.run();
		db.insert(schema.contact)
			.values({ id: 'c-tim', householdId: H, createdBy: U1, displayName: 'Tim Brunner' })
			.run();
		ownAddress('f-tim', 'c-tim', 'lindenweg 4 3000 bern');

		const result = await run({
			...document([]),
			people: [
				{ ref: 'anna', existingId: 'c-anna', fields: [] },
				{ ref: 'tim', existingId: 'c-tim', fields: [], home: { with: 'anna' } }
			]
		});
		expect(result).toMatchObject({ ok: true, added: { homes: 0, residents: 1 } });
		expect(residents()).toEqual([
			{ homeId: 'h-1', contactId: 'c-anna' },
			{ homeId: 'h-1', contactId: 'c-tim' }
		]);
		expect(addressesOf('c-tim')).toEqual([]);
	});
});
