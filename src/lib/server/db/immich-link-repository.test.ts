import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Viewer } from '../access/visibility';
import type { NewActivityEntry } from '../domain/activity/activity';
import * as schema from './schema';
import { createDrizzleImmichLinkRepository } from './immich-link-repository';

/*
 * Integration spec for the Drizzle ImmichLinkRepository: a link follows its contact's
 * visibility (docs/concepts/immich.md §5), goes with the contact, and is written together with
 * its activity-log line.
 */

const H = 'household-1';
const OTHER_H = 'household-2';
const ANNA = 'u-anna';
const BERT = 'u-bert';
const DORA = 'u-dora';
const asAnna: Viewer = { id: ANNA, householdId: H };
const asBert: Viewer = { id: BERT, householdId: H };
const asDora: Viewer = { id: DORA, householdId: OTHER_H };
const PERSON = '0b1e2a3c-4d5e-4f60-8a1b-2c3d4e5f6a70';
const OTHER_PERSON = '0c2e3a4b-5d6e-4f70-9a2b-3c4d5e6f7a81';

let db: BunSQLiteDatabase<typeof schema>;
let repo: ReturnType<typeof createDrizzleImmichLinkRepository>;

const entry = (id: string, contactId: string): NewActivityEntry => ({
	id,
	householdId: H,
	actorId: ANNA,
	action: 'update',
	entityType: 'immich_link',
	entityId: contactId,
	contactId,
	visibility: 'shared',
	summary: 'linked',
	createdAt: 5
});

const link = (contactId: string, immichPersonId = PERSON) => ({
	contactId,
	immichPersonId,
	linkedBy: ANNA,
	linkedAt: 5
});

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values([{ id: H, name: 'H' }, { id: OTHER_H, name: 'Other' }]).run();
	db.insert(schema.user)
		.values([
			{ id: ANNA, householdId: H, email: 'anna@example.test', name: 'Anna' },
			{ id: BERT, householdId: H, email: 'bert@example.test', name: 'Bert' },
			{ id: DORA, householdId: OTHER_H, email: 'dora@example.test', name: 'Dora' }
		])
		.run();
	db.insert(schema.contact)
		.values([
			{ id: 'c-shared', householdId: H, createdBy: ANNA, visibility: 'shared', displayName: 'Carl' },
			{ id: 'c-private', householdId: H, createdBy: ANNA, visibility: 'private', displayName: 'Private' }
		])
		.run();
	repo = createDrizzleImmichLinkRepository(db);
});

describe('createDrizzleImmichLinkRepository', () => {
	it('saves a link with its log line, and reads it back', async () => {
		expect(await repo.save(link('c-shared'), entry('a1', 'c-shared'))).toBe('saved');

		expect(await repo.findForContactVisibleTo(asAnna, 'c-shared')).toEqual(link('c-shared'));
		expect(db.select().from(schema.activityLog).all().map((row) => row.id)).toEqual(['a1']);
	});

	it('replaces a contact’s link rather than adding a second', async () => {
		await repo.save(link('c-shared'), entry('a1', 'c-shared'));
		await repo.save(link('c-shared', OTHER_PERSON), entry('a2', 'c-shared'));

		expect((await repo.findForContactVisibleTo(asAnna, 'c-shared'))?.immichPersonId).toBe(OTHER_PERSON);
		expect(db.select().from(schema.immichLink).all()).toHaveLength(1);
	});

	it('shows a link only to those who see the contact', async () => {
		await repo.save(link('c-shared'), entry('a1', 'c-shared'));
		await repo.save(link('c-private', OTHER_PERSON), entry('a2', 'c-private'));

		expect(await repo.findForContactVisibleTo(asBert, 'c-shared')).not.toBeNull();
		expect(await repo.findForContactVisibleTo(asAnna, 'c-private')).not.toBeNull();
		expect(await repo.findForContactVisibleTo(asBert, 'c-private')).toBeNull();
		expect(await repo.findForContactVisibleTo(asDora, 'c-shared')).toBeNull();
	});

	it('removes a link with its log line, and reports a missing one without writing', async () => {
		await repo.save(link('c-shared'), entry('a1', 'c-shared'));

		expect(await repo.remove('c-shared', entry('a2', 'c-shared'))).toBe(true);
		expect(await repo.findForContactVisibleTo(asAnna, 'c-shared')).toBeNull();

		expect(await repo.remove('c-shared', entry('a3', 'c-shared'))).toBe(false);
		expect(db.select().from(schema.activityLog).all().map((row) => row.id)).toEqual(['a1', 'a2']);
	});

	it('holds one Immich person to one contact: a second link is taken, and nothing is written', async () => {
		await repo.save(link('c-shared'), entry('a1', 'c-shared'));

		// What a second member's request meets when it passed the use-case's check a moment
		// before the first one wrote: the index, not the check, has the last word.
		expect(await repo.save(link('c-private'), entry('a2', 'c-private'))).toBe('taken');
		expect(db.select().from(schema.immichLink).all().map((l) => l.contactId)).toEqual(['c-shared']);
		expect(db.select().from(schema.activityLog).all().map((row) => row.id)).toEqual(['a1']);
	});

	it('says who holds a person, naming them only to a viewer who sees them', async () => {
		await repo.save(link('c-private', PERSON), entry('a1', 'c-private'));
		await repo.save(link('c-shared', OTHER_PERSON), entry('a2', 'c-shared'));

		const forAnna = await repo.holdersOf(asAnna, [PERSON, OTHER_PERSON]);
		expect(forAnna.get(PERSON)).toEqual({ contactId: 'c-private', name: 'Private' });
		expect(forAnna.get(OTHER_PERSON)).toEqual({ contactId: 'c-shared', name: 'Carl' });

		const forBert = await repo.holdersOf(asBert, [PERSON]);
		expect(forBert.get(PERSON)).toEqual({ contactId: 'c-private', name: null });

		expect((await repo.holdersOf(asAnna, [])).size).toBe(0);
	});

	it('goes with its contact', async () => {
		await repo.save(link('c-shared'), entry('a1', 'c-shared'));
		db.delete(schema.contact).run();
		expect(db.select().from(schema.immichLink).all()).toEqual([]);
	});
});
