import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import { peopleStampOf } from '../domain/contacts/people-stamp';
import { createDrizzleCircleRepository } from './circle-repository';
import { createDrizzleContactRepository } from './contact-repository';
import { createDrizzlePeopleStampReads } from './people-stamp-reads';
import { createDrizzlePhotoRepository } from './photo-repository';
import { createDrizzleRelationshipRepository } from './relationship-repository';
import { createDrizzleRelationshipTypeRepository } from './relationship-type-repository';
import * as schema from './schema';

/*
 * The stamp behind the shell's freshness check (docs/04 §4.9). The shell's people list is
 * reloaded only when the stamp differs, so a write that changes what the shell would send and
 * leaves the stamp alone is a stale picker. Every write the list and the namesake context are
 * made of is driven here through the repository that makes it, and each must move the stamp.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const andy: Viewer = { id: U1, householdId: H };
const mia: Viewer = { id: U2, householdId: H };
const DAY = '2026-10-01';

let db: BunSQLiteDatabase<typeof schema>;
let sqlite: Database;
let clock = 1_000;
const tick = () => ++clock;

function person(id: string, visibility: 'shared' | 'private' = 'shared', createdBy = U1) {
	db.insert(schema.contact)
		.values({
			id,
			householdId: H,
			createdBy,
			visibility,
			displayName: id,
			createdAt: tick(),
			updatedAt: clock
		})
		.run();
}

const stampFor = (viewer: Viewer, selfContactId: string | null = null, today = DAY) =>
	peopleStampOf({ stamps: createDrizzlePeopleStampReads(db) }, viewer, { selfContactId, today });

beforeEach(() => {
	sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user)
		.values([
			{ id: U1, householdId: H, email: 'u1@x.test', name: 'Andy' },
			{ id: U2, householdId: H, email: 'u2@x.test', name: 'Mia' }
		])
		.run();
	db.insert(schema.relationshipType)
		.values([
			{
				id: 'friend',
				householdId: null,
				key: 'friend',
				forwardLabel: 'Friend of',
				reverseLabel: 'Friend of',
				category: 'social',
				symmetric: 1
			},
			{
				id: 'own',
				householdId: H,
				key: 'own',
				forwardLabel: 'Coach of',
				reverseLabel: 'Coached by',
				category: 'social'
			}
		])
		.run();
	person('anna');
	person('ben');
	person('cleo');
	db.insert(schema.photo)
		.values({
			id: 'p-anna',
			householdId: H,
			contactId: 'anna',
			createdBy: U1,
			filePath: 'a.jpg',
			thumbPath: 'a-t.jpg',
			mime: 'image/jpeg'
		})
		.run();
	db.insert(schema.relationship)
		.values({
			id: 'r-ab',
			householdId: H,
			fromContactId: 'anna',
			toContactId: 'ben',
			typeId: 'friend',
			createdBy: U1,
			createdAt: tick(),
			updatedAt: clock
		})
		.run();
	db.insert(schema.circle)
		.values({
			id: 'choir',
			householdId: H,
			createdBy: U1,
			name: 'Choir',
			createdAt: tick(),
			updatedAt: clock
		})
		.run();
	db.insert(schema.circleMembership)
		.values({
			id: 'm-anna',
			circleId: 'choir',
			contactId: 'anna',
			createdBy: U1,
			createdAt: tick(),
			updatedAt: clock
		})
		.run();
});

describe('the people stamp', () => {
	it('stays the same while nothing is written', async () => {
		expect(await stampFor(andy)).toBe(await stampFor(andy));
	});

	const writes: [string, () => Promise<unknown> | unknown][] = [
		['a person added', () => person('dora')],
		[
			'a name edited',
			() =>
				createDrizzleContactRepository(db).updateProfile('ben', {
					displayName: 'Ben B.',
					description: null,
					updatedAt: tick()
				})
		],
		[
			'a description written',
			() =>
				createDrizzleContactRepository(db).updateProfile('ben', {
					displayName: 'ben',
					description: 'from school',
					updatedAt: tick()
				})
		],
		['a person archived', () => createDrizzleContactRepository(db).setArchived('cleo', tick())],
		[
			'a person deleted',
			() =>
				createDrizzleContactRepository(db).deleteVisibleTo(andy, 'cleo', {
					id: 'log-1',
					householdId: H,
					actorId: U1,
					action: 'delete',
					entityType: 'contact',
					entityId: 'cleo',
					contactId: null,
					visibility: 'shared',
					summary: 'removed cleo',
					createdAt: tick()
				})
		],
		[
			'an avatar set, which does not touch updated_at',
			() => createDrizzlePhotoRepository(db).setContactAvatar('anna', 'p-anna')
		],
		[
			'a link added',
			() =>
				createDrizzleRelationshipRepository(db).insert({
					id: 'r-bc',
					householdId: H,
					fromContactId: 'ben',
					toContactId: 'cleo',
					typeId: 'friend',
					description: null,
					sinceDate: null,
					status: 'current',
					createdBy: U1,
					createdAt: tick(),
					updatedAt: clock
				})
		],
		[
			'a link ended',
			() =>
				createDrizzleRelationshipRepository(db).updateVisibleTo(
					andy,
					'r-ab',
					{ description: null, sinceDate: null, status: 'former', retype: null },
					tick()
				)
		],
		['a link removed', () => createDrizzleRelationshipRepository(db).removeVisibleTo(andy, 'r-ab')],
		[
			"a household type's label changed",
			() =>
				createDrizzleRelationshipTypeRepository(db).updateTypeVisibleTo(andy, 'own', {
					forwardLabel: 'Trainer of',
					reverseLabel: 'Coached by',
					category: 'social',
					symmetric: false
				})
		],
		[
			'a circle added',
			() =>
				createDrizzleCircleRepository(db).insert({
					id: 'school',
					householdId: H,
					createdBy: U1,
					visibility: 'shared',
					name: 'School',
					description: null,
					kind: 'school',
					color: 'blue',
					startDate: null,
					endDate: null,
					createdAt: tick(),
					updatedAt: clock
				})
		],
		[
			'someone joined a circle',
			() =>
				createDrizzleCircleRepository(db).addMemberships([
					{
						id: 'm-ben',
						circleId: 'choir',
						contactId: 'ben',
						role: null,
						createdBy: U1,
						createdAt: tick(),
						updatedAt: clock
					}
				])
		],
		[
			'a role given',
			() => createDrizzleCircleRepository(db).setRoles('choir', ['anna'], 'Alto', tick())
		],
		[
			'someone left a circle',
			() => createDrizzleCircleRepository(db).removeMembership('choir', 'anna')
		]
	];

	for (const [what, write] of writes) {
		it(`changes with ${what}`, async () => {
			const before = await stampFor(andy);
			await write();
			expect(await stampFor(andy)).not.toBe(before);
		});
	}

	it('changes with who the reader is and with the day, which the context is read against', async () => {
		const plain = await stampFor(andy);
		expect(await stampFor(andy, 'anna')).not.toBe(plain);
		expect(await stampFor(andy, null, '2026-10-02')).not.toBe(plain);
	});

	it("keeps still for a write the reader cannot see, so another member's private person stays private", async () => {
		const [before, ownersBefore] = [await stampFor(andy), await stampFor(mia)];
		person('secret', 'private', U2);
		expect(await stampFor(andy)).toBe(before);
		// Positive control: the owner's own stamp did move.
		expect(await stampFor(mia)).not.toBe(ownersBefore);
	});
});

describe('what the stamp costs', () => {
	it('is one statement of aggregates, however many people there are', async () => {
		for (const id of ['dora', 'emil', 'fritz']) person(id);
		const sent: string[] = [];
		const watched = Object.create(sqlite) as Database;
		watched.prepare = ((sql: string) => {
			sent.push(sql);
			return sqlite.prepare(sql);
		}) as Database['prepare'];
		const reads = createDrizzlePeopleStampReads(drizzle(watched, { schema }));

		await reads.markersVisibleTo(andy);

		expect(sent).toHaveLength(1);
	});
});
