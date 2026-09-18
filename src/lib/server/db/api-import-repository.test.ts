import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import { importViaApi, type ApiImportDeps } from '../domain/import/api/api-import';
import type { ApiImportDocument } from '../domain/import/api/document';
import { createDrizzleApiImportRepository } from './api-import-repository';
import * as schema from './schema';
import { seedRelationshipTypes } from './seed';

/*
 * Integration spec for the import API's adapter: the household is read with the member's
 * scope, and a plan lands whole, once, however often it is sent. Driven through the use-case so
 * the real reading feeds the real planner.
 */

const H = 'household-1';
const OTHER_H = 'household-2';
const U1 = 'user-1';
const U2 = 'user-2';
const viewer: Viewer = { id: U1, householdId: H };
const actor = { userId: U1, householdId: H, defaultVisibility: 'shared' as const };
const wording = {
	imported: (people: number, source: string) => `imported ${people} from ${source}`
};

let db: BunSQLiteDatabase<typeof schema>;
let deps: ApiImportDeps;

function seedContact(id: string, over: Partial<typeof schema.contact.$inferInsert> = {}) {
	db.insert(schema.contact)
		.values({ id, householdId: H, createdBy: U1, displayName: id, ...over })
		.run();
}

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	seedRelationshipTypes(db);
	db.insert(schema.household)
		.values([
			{ id: H, name: 'H' },
			{ id: OTHER_H, name: 'Other' }
		])
		.run();
	db.insert(schema.user)
		.values([
			{ id: U1, householdId: H, email: 'u1@x.test', name: 'One' },
			{ id: U2, householdId: H, email: 'u2@x.test', name: 'Two' },
			{ id: 'user-x', householdId: OTHER_H, email: 'x@x.test', name: 'X' }
		])
		.run();
	let seq = 0;
	deps = {
		imports: createDrizzleApiImportRepository(db),
		clock: { now: () => 1_700_000_000_000 },
		ids: { next: () => `log-${++seq}` }
	};
});

const newPerson = (ref: string, firstName: string) => ({
	ref,
	displayName: null,
	firstName,
	lastName: 'Muster',
	nickname: null,
	description: null,
	birthDate: null,
	fields: [{ kind: 'phone' as const, value: '+41 79 000 00 00', label: null }]
});

const kindergarten: ApiImportDocument = {
	source: 'kg',
	visibility: null,
	people: [
		newPerson('anna', 'Anna'),
		newPerson('bert', 'Bert'),
		{ ref: 'carl', existingId: 'c-carl' }
	],
	relationships: [
		{ from: 'anna', to: 'carl', type: 'parent_child' },
		{ from: 'bert', to: 'carl', type: 'parent_child' },
		{ from: 'anna', to: 'bert', type: 'partner' }
	],
	circles: [
		{
			ref: 'kg',
			name: 'Kindergarten',
			kind: 'class',
			description: null,
			startDate: '2023-08-01',
			endDate: '2024-07-31',
			parent: null,
			members: [
				{ person: 'carl', role: 'Child', startDate: '2023-08-01', endDate: '2024-07-31' },
				{ person: 'anna', role: 'Parent', startDate: null, endDate: null }
			]
		}
	]
};

const run = (document: ApiImportDocument, dryRun = false) =>
	importViaApi(deps, actor, document, { dryRun, wording });

describe('the import API adapter', () => {
	beforeEach(() => seedContact('c-carl', { displayName: 'Carl Muster' }));

	it('writes the whole plan and logs it', async () => {
		const result = await run(kindergarten);
		expect(result).toMatchObject({
			ok: true,
			added: { people: 2, fields: 2, relationships: 3, circles: 1, memberships: 2 }
		});
		expect(
			db
				.select()
				.from(schema.contact)
				.all()
				.map((c) => c.id)
				.sort()
		).toEqual(['api~kg~p~anna', 'api~kg~p~bert', 'c-carl']);
		expect(
			db
				.select()
				.from(schema.circleMembership)
				.all()
				.map((m) => [m.contactId, m.role, m.startDate])
		).toEqual([
			['c-carl', 'Child', '2023-08-01'],
			['api~kg~p~anna', 'Parent', null]
		]);
		expect(
			db
				.select()
				.from(schema.relationship)
				.all()
				.every((r) => r.status === 'current')
		).toBe(true);
		expect(
			db
				.select()
				.from(schema.activityLog)
				.all()
				.map((a) => a.summary)
		).toEqual(['imported 2 from kg']);
	});

	it('adds nothing the second time, and says so', async () => {
		await run(kindergarten);
		const again = await run(kindergarten);
		expect(again).toMatchObject({
			ok: true,
			added: { people: 0, fields: 0, relationships: 0, circles: 0, memberships: 0 }
		});
		if (!again.ok) throw new Error('refused');
		expect(again.report.people.map((p) => p.status)).toEqual(['imported', 'imported', 'existing']);
		expect(again.report.alreadyThere).toEqual({ relationships: 3, memberships: 2 });
		expect(db.select().from(schema.contact).all()).toHaveLength(3);
		expect(db.select().from(schema.activityLog).all()).toHaveLength(1);
	});

	it('writes nothing on a dry run', async () => {
		const result = await run(kindergarten, true);
		expect(result).toMatchObject({
			ok: true,
			dryRun: true,
			added: { people: 2, relationships: 3 }
		});
		expect(
			db
				.select()
				.from(schema.contact)
				.all()
				.map((c) => c.id)
		).toEqual(['c-carl']);
		expect(db.select().from(schema.activityLog).all()).toEqual([]);
	});

	it('does not let a document reach a person the member may not see', async () => {
		seedContact('c-private', { createdBy: U2, visibility: 'private' });
		db.insert(schema.contact)
			.values({
				id: 'c-foreign',
				householdId: OTHER_H,
				createdBy: 'user-x',
				displayName: 'Foreign'
			})
			.run();
		const result = await run({
			...kindergarten,
			people: [
				{ ref: 'p', existingId: 'c-private' },
				{ ref: 'f', existingId: 'c-foreign' }
			],
			relationships: [],
			circles: []
		});
		expect(result).toEqual({
			ok: false,
			problems: [
				{ code: 'personNotFound', path: 'people[0].existingId', id: 'c-private' },
				{ code: 'personNotFound', path: 'people[1].existingId', id: 'c-foreign' }
			]
		});
	});

	it('refuses to create under an id another member holds privately', async () => {
		seedContact('api~kg~p~anna', { createdBy: U2, visibility: 'private' });
		const result = await run({
			...kindergarten,
			people: [newPerson('anna', 'Anna')],
			relationships: [],
			circles: []
		});
		expect(result).toEqual({
			ok: false,
			problems: [{ code: 'idTaken', path: 'people[0].ref', ref: 'anna' }]
		});
	});

	it('reads the household’s links, so a third parent is refused', async () => {
		seedContact('c-x');
		seedContact('c-y');
		db.insert(schema.relationship)
			.values([
				{
					id: 'r-1',
					householdId: H,
					fromContactId: 'c-x',
					toContactId: 'c-carl',
					typeId: 'parent_child',
					createdBy: U1
				},
				{
					id: 'r-2',
					householdId: H,
					fromContactId: 'c-y',
					toContactId: 'c-carl',
					typeId: 'parent_child',
					createdBy: U1
				}
			])
			.run();
		const result = await run({ ...kindergarten, circles: [] });
		expect(result).toMatchObject({
			ok: false,
			problems: [
				{
					code: 'relationshipExcluded',
					path: 'relationships[0]',
					reason: 'parentsComplete',
					personId: 'c-carl'
				},
				{
					code: 'relationshipExcluded',
					path: 'relationships[1]',
					reason: 'parentsComplete',
					personId: 'c-carl'
				}
			]
		});
	});

	it('skips a link the household already stored under another id', async () => {
		seedContact('c-dora');
		db.insert(schema.relationship)
			.values({
				id: 'r-1',
				householdId: H,
				fromContactId: 'c-carl',
				toContactId: 'c-dora',
				typeId: 'friend',
				createdBy: U1
			})
			.run();
		const result = await run({
			...kindergarten,
			people: [
				{ ref: 'carl', existingId: 'c-carl' },
				{ ref: 'dora', existingId: 'c-dora' }
			],
			relationships: [{ from: 'dora', to: 'carl', type: 'friend' }],
			circles: []
		});
		expect(result).toMatchObject({
			ok: true,
			added: { relationships: 0 },
			report: { alreadyThere: { relationships: 1 } }
		});
	});

	it('adds to a circle already there without enrolling a member twice', async () => {
		db.insert(schema.circle)
			.values({ id: 'ci-kg', householdId: H, createdBy: U1, name: 'KG' })
			.run();
		db.insert(schema.circleMembership)
			.values({ id: 'm-1', circleId: 'ci-kg', contactId: 'c-carl', createdBy: U1 })
			.run();
		const result = await run({
			...kindergarten,
			relationships: [],
			circles: [
				{
					ref: 'kg',
					existingId: 'ci-kg',
					members: [
						{ person: 'carl', role: null, startDate: null, endDate: null },
						{ person: 'anna', role: null, startDate: null, endDate: null }
					]
				}
			]
		});
		expect(result).toMatchObject({ ok: true, added: { memberships: 1 } });
		expect(
			db
				.select()
				.from(schema.circleMembership)
				.all()
				.map((m) => m.contactId)
				.sort()
		).toEqual(['api~kg~p~anna', 'c-carl']);
	});

	it('enrols nobody twice when someone joined between reading and writing', async () => {
		db.insert(schema.circle)
			.values({ id: 'ci-kg', householdId: H, createdBy: U1, name: 'KG' })
			.run();
		const stamps = { createdBy: U1, createdAt: 1, updatedAt: 1 };
		const stale = {
			contacts: [],
			fields: [],
			relationships: [],
			circles: [],
			// Planned while Carl was not in the circle yet …
			memberships: [
				{
					id: 'api~kg~m~kg~carl',
					circleId: 'ci-kg',
					contactId: 'c-carl',
					role: null,
					startDate: null,
					endDate: null,
					...stamps
				}
			],
			report: {
				people: [],
				circles: [],
				possibleDuplicates: [],
				alreadyThere: { relationships: 0, memberships: 0 }
			}
		};
		// … and added by hand before the plan was written.
		db.insert(schema.circleMembership)
			.values({ id: 'm-hand', circleId: 'ci-kg', contactId: 'c-carl', createdBy: U1 })
			.run();
		const added = await createDrizzleApiImportRepository(db).applyPlan(stale, null);
		expect(added.memberships).toBe(0);
		expect(
			db
				.select()
				.from(schema.circleMembership)
				.all()
				.map((m) => m.id)
		).toEqual(['m-hand']);
	});

	it('points out a look-alike the member may see, and only one they may see', async () => {
		seedContact('c-anna', { displayName: 'Anna Muster', birthDate: '2019-06-23' });
		seedContact('c-bert', { displayName: 'Bert Muster', createdBy: U2, visibility: 'private' });
		const result = await run({ ...kindergarten, relationships: [], circles: [] }, true);
		expect(result).toMatchObject({
			ok: true,
			report: {
				possibleDuplicates: [
					{
						ref: 'anna',
						candidates: [{ id: 'c-anna', displayName: 'Anna Muster', birthDate: '2019-06-23' }]
					}
				]
			}
		});
	});
});
