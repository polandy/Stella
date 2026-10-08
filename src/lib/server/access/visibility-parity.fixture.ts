import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as schema from '../db/schema';
import {
	activityLog,
	circle,
	circleMembership,
	contact,
	gift,
	interaction,
	journalEntry,
	note,
	photo,
	relationship
} from '../db/schema';
import type { Viewer, Visibility } from './visibility';

/*
 * The rows `visibility-parity.test.ts` filters both ways: two households, two members each,
 * and every record kind a visibility rule covers — shared and private, own and someone else's.
 * Ids name what a row is (`n-priv-u1`: a note private to user 1), so a failing case reads.
 */

export const H1 = 'household-1';
export const H2 = 'household-2';
export const U1 = 'user-1';
export const U2 = 'user-2';
export const U3 = 'user-3-foreign';
export const U4 = 'user-4-foreign';

export const VIEWERS: Record<string, Viewer> = {
	u1: { id: U1, householdId: H1 },
	u2: { id: U2, householdId: H1 },
	u3: { id: U3, householdId: H2 },
	u4: { id: U4, householdId: H2 }
};

/** Contacts: every household × owner × visibility the rules distinguish. */
const CONTACTS = [
	{ id: 'c-shared', householdId: H1, createdBy: U1, visibility: 'shared' },
	{ id: 'c-priv-u1', householdId: H1, createdBy: U1, visibility: 'private' },
	{ id: 'c-priv-u2', householdId: H1, createdBy: U2, visibility: 'private' },
	{ id: 'c-foreign', householdId: H2, createdBy: U3, visibility: 'shared' },
	{ id: 'c-foreign-priv', householdId: H2, createdBy: U3, visibility: 'private' }
] as const;

/** Circles, the same spread. */
const CIRCLES = [
	{ id: 'k-shared', householdId: H1, createdBy: U1, visibility: 'shared' },
	{ id: 'k-priv-u1', householdId: H1, createdBy: U1, visibility: 'private' },
	{ id: 'k-priv-u2', householdId: H1, createdBy: U2, visibility: 'private' },
	{ id: 'k-foreign', householdId: H2, createdBy: U3, visibility: 'shared' },
	{ id: 'k-foreign-priv', householdId: H2, createdBy: U3, visibility: 'private' }
] as const;

/**
 * The children every parent gets, by id suffix: shared, private of each member of its
 * household. Under a private parent the shared child is the interesting one — the parent
 * alone must hide it.
 */
const CHILDREN: { parent: string; suffix: string; createdBy: string; visibility: Visibility }[] = [
	{ parent: 'shared', suffix: 'shared', createdBy: U1, visibility: 'shared' },
	{ parent: 'shared', suffix: 'priv-u1', createdBy: U1, visibility: 'private' },
	{ parent: 'shared', suffix: 'priv-u2', createdBy: U2, visibility: 'private' },
	{ parent: 'priv-u1', suffix: 'on-priv-u1', createdBy: U2, visibility: 'shared' },
	{ parent: 'priv-u2', suffix: 'on-priv-u2', createdBy: U2, visibility: 'shared' },
	{ parent: 'foreign', suffix: 'foreign', createdBy: U3, visibility: 'shared' },
	{ parent: 'foreign', suffix: 'foreign-priv-u3', createdBy: U3, visibility: 'private' }
];

const householdOfParent = (parent: string) => (parent.startsWith('foreign') ? H2 : H1);

/** Activity entries: each member's shared and private action. */
const ACTIVITY = [U1, U2, U3, U4].flatMap((actorId) =>
	(['shared', 'private'] as const).map((visibility) => ({
		id: `a-${actorId}-${visibility}`,
		householdId: actorId === U3 || actorId === U4 ? H2 : H1,
		actorId,
		visibility
	}))
);

/** A migrated in-memory database holding every row above, and the memberships, relationships
 * and activity entries built from them. */
export function seedParityDb(): BunSQLiteDatabase<typeof schema> {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });

	db.insert(schema.household)
		.values([
			{ id: H1, name: 'Household One' },
			{ id: H2, name: 'Household Two' }
		])
		.run();
	db.insert(schema.user)
		.values(
			Object.values(VIEWERS).map((v) => ({
				id: v.id,
				householdId: v.householdId,
				email: `${v.id}@example.test`,
				name: v.id
			}))
		)
		.run();
	db.insert(schema.relationshipType)
		.values({
			id: 'rt-friend',
			key: 'friend',
			forwardLabel: 'Friend',
			reverseLabel: 'Friend',
			category: 'social',
			symmetric: 1
		})
		.run();

	db.insert(contact)
		.values(CONTACTS.map((c) => ({ ...c, displayName: c.id })))
		.run();
	db.insert(circle)
		.values(CIRCLES.map((k) => ({ ...k, name: k.id })))
		.run();

	for (const { parent, suffix, createdBy, visibility } of CHILDREN) {
		const contactId = `c-${parent}`;
		const common = { contactId, createdBy, visibility };
		db.insert(note)
			.values({ id: `n-${suffix}`, ...common, body: suffix })
			.run();
		db.insert(journalEntry)
			.values({ id: `j-${suffix}`, ...common, entryDate: '2026-10-08', body: suffix })
			.run();
		db.insert(interaction)
			.values({ id: `i-${suffix}`, ...common, kind: 'met', happenedAt: '2026-10-08' })
			.run();
		db.insert(gift)
			.values({ id: `g-${suffix}`, ...common, state: 'idea', title: suffix })
			.run();
		const file = { filePath: `${suffix}.jpg`, thumbPath: `${suffix}_t.jpg`, mime: 'image/jpeg' };
		const householdId = householdOfParent(parent);
		db.insert(photo)
			.values([
				{ id: `p-${suffix}`, householdId, contactId, createdBy, visibility, ...file },
				{ id: `kp-${suffix}`, householdId, circleId: `k-${parent}`, createdBy, visibility, ...file }
			])
			.run();
	}

	// Every circle × contact within a household, and every ordered pair of distinct contacts.
	for (const k of CIRCLES) {
		for (const c of CONTACTS.filter((c) => c.householdId === k.householdId)) {
			db.insert(circleMembership)
				.values({
					id: `m-${k.id}--${c.id}`,
					circleId: k.id,
					contactId: c.id,
					createdBy: k.createdBy
				})
				.run();
		}
	}
	for (const from of CONTACTS) {
		for (const to of CONTACTS.filter((c) => c.householdId === from.householdId && c !== from)) {
			db.insert(relationship)
				.values({
					id: `r-${from.id}--${to.id}`,
					householdId: from.householdId,
					fromContactId: from.id,
					toContactId: to.id,
					typeId: 'rt-friend',
					createdBy: from.createdBy
				})
				.run();
		}
	}

	db.insert(activityLog)
		.values(
			ACTIVITY.map((a) => ({
				...a,
				action: 'delete' as const,
				entityType: 'contact',
				entityId: a.id,
				summary: a.id
			}))
		)
		.run();
	return db;
}
