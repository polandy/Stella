import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq, sql } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Remover, Viewer } from '../access/visibility';
import {
	activityRecord,
	type ActivityRecord,
	type PlainActivityEvent
} from '../domain/activity/activity';
import { createDrizzleCircleRepository } from './circle-repository';
import { createDrizzleContactRepository } from './contact-repository';
import { createDrizzleJournalRepository } from './journal-repository';
import { createDrizzlePhotoRepository } from './photo-repository';
import * as schema from './schema';

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const creator: Remover = { id: U1, householdId: H, isAdmin: false };
const admin: Remover = { id: U2, householdId: H, isAdmin: true };

let db: BunSQLiteDatabase<typeof schema>;

function seedContact(id: string, visibility: 'shared' | 'private' = 'shared', createdBy = U1) {
	db.insert(schema.contact)
		.values({ id, householdId: H, createdBy, visibility, displayName: id })
		.run();
}

function seedCircle(
	id: string,
	members: string[],
	over: Partial<typeof schema.circle.$inferInsert> = {}
) {
	db.insert(schema.circle)
		.values({ id, householdId: H, createdBy: U1, visibility: 'shared', name: id, ...over })
		.run();
	for (const contactId of members) {
		db.insert(schema.circleMembership)
			.values({ id: `${id}-${contactId}`, circleId: id, contactId, createdBy: U1 })
			.run();
	}
}

function seedJournalEntry(
	id: string,
	contactId: string,
	createdBy = U1,
	visibility = 'shared' as const
) {
	db.insert(schema.journalEntry)
		.values({
			id,
			contactId,
			subjectKey: `subj-${id}`,
			createdBy,
			entryDate: '2026-01-01',
			visibility,
			body: 'x'
		})
		.run();
}

function seedPhoto(over: Partial<typeof schema.photo.$inferInsert>) {
	db.insert(schema.photo)
		.values({
			id: over.id!,
			householdId: H,
			contactId: over.contactId!,
			createdBy: U1,
			visibility: 'shared',
			filePath: `${over.id}.jpg`,
			thumbPath: `${over.id}_t.jpg`,
			mime: 'image/jpeg',
			width: 100,
			height: 100,
			sizeBytes: 100,
			takenAt: null,
			createdAt: 0,
			...over
		})
		.run();
}

const findOrphanedPhotos = (db: BunSQLiteDatabase<typeof schema>) => {
	return db
		.select()
		.from(schema.photo)
		.where(
			sql`( ${schema.photo.framingOf} IS NOT NULL AND ${schema.photo.framingOf} NOT IN (SELECT id FROM photo) ) OR
		     ( ${schema.photo.cutFrom} IS NOT NULL AND ${schema.photo.cutFrom} NOT IN (SELECT id FROM photo) ) OR
		     ( ${schema.photo.circleId} IS NOT NULL AND ${schema.photo.circleId} NOT IN (SELECT id FROM circle) ) OR
		     ( ${schema.photo.journalEntryId} IS NOT NULL AND ${schema.photo.journalEntryId} NOT IN (SELECT id FROM journal_entry) )`
		)
		.all();
};

/** Helper to create an audit record for the log. */
function makeAudit<E extends PlainActivityEvent>(
	event: E,
	by: Viewer = { id: U1, householdId: H }
): ActivityRecord<E> {
	const deps = {
		ids: { next: () => `log-${Math.random()}` },
		clock: { now: () => 1000 }
	};
	return activityRecord(deps, by, event);
}

describe('orphan detection', () => {
	beforeEach(async () => {
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
	});

	it('finds nothing when there are no orphans', async () => {
		seedContact('c1');
		seedPhoto({ id: 'p1', contactId: 'c1' });
		expect(findOrphanedPhotos(db)).toEqual([]);
	});

	it('finds a dangling photo when manually planted', async () => {
		seedContact('c1');
		seedPhoto({ id: 'p1', contactId: 'c1' });
		// Plant an orphan: a photo pointing to a non-existent photo
		db.insert(schema.photo)
			.values({
				id: 'p-orphan',
				householdId: H,
				contactId: 'c1',
				createdBy: U1,
				visibility: 'shared',
				filePath: 'p-orphan.jpg',
				thumbPath: 'p-orphan_t.jpg',
				mime: 'image/jpeg',
				width: 100,
				height: 100,
				sizeBytes: 100,
				takenAt: null,
				createdAt: 0,
				framingOf: 'non-existent-photo'
			})
			.run();

		const orphans = findOrphanedPhotos(db);
		expect(orphans.length).toBe(1);
		expect(orphans[0].id).toBe('p-orphan');
	});

	it('cleans up after contact deletion (including photos)', async () => {
		seedContact('c1');
		seedPhoto({ id: 'p1', contactId: 'c1' });
		const repo = createDrizzleContactRepository(db);
		const audit = makeAudit({
			kind: 'contact.deleted',
			contactId: 'c1',
			displayName: 'c1',
			visibility: 'shared'
		});

		expect(await repo.deleteDeletableBy(admin, 'c1', audit)).not.toBeNull();
		expect(
			db.select().from(schema.contact).where(eq(schema.contact.id, 'c1')).get()
		).toBeUndefined();
		expect(db.select().from(schema.photo).where(eq(schema.photo.id, 'p1')).get()).toBeUndefined();
		expect(findOrphanedPhotos(db)).toEqual([]);
	});

	it('cleans up after circle deletion (including group photos and cuts)', async () => {
		seedContact('c1');
		seedCircle('circ1', ['c1']);
		seedPhoto({ id: 'group-p', contactId: 'c1', circleId: 'circ1' });
		// A cut of the group photo
		seedPhoto({ id: 'cut-p', contactId: 'c1', framingOf: 'group-p' });

		const repo = createDrizzleCircleRepository(db);
		const audit = makeAudit({
			kind: 'circle.deleted',
			circleId: 'circ1',
			name: 'circ1',
			visibility: 'shared'
		});

		expect(await repo.deleteDeletable(creator, 'circ1', audit)).not.toBeNull();
		expect(
			db.select().from(schema.circle).where(eq(schema.circle.id, 'circ1')).get()
		).toBeUndefined();
		expect(
			db.select().from(schema.photo).where(eq(schema.photo.id, 'group-p')).get()
		).toBeUndefined();
		// The cut should have become its own photo (framingOf is null)
		const cutRow = db.select().from(schema.photo).where(eq(schema.photo.id, 'cut-p')).get();
		expect(cutRow).toBeDefined();
		expect(cutRow?.framingOf).toBeNull();
		expect(findOrphanedPhotos(db)).toEqual([]);
	});

	it('cleans up after journal entry deletion (including photos)', async () => {
		seedContact('c1');
		seedJournalEntry('j1', 'c1');
		seedPhoto({ id: 'jp1', contactId: 'c1', journalEntryId: 'j1' });

		const repo = createDrizzleJournalRepository(db, { next: () => 'gen-id' });
		const auditJ = makeAudit({
			kind: 'record.removed',
			recordKind: 'journal_entry',
			recordId: 'j1',
			contactId: 'c1',
			person: 'c1',
			authorId: U1,
			authorName: 'One',
			visibility: 'shared'
		});

		expect(await repo.deleteRemovableBy(creator, 'j1', auditJ)).not.toBeNull();
		expect(
			db.select().from(schema.journalEntry).where(eq(schema.journalEntry.id, 'j1')).get()
		).toBeUndefined();
		expect(db.select().from(schema.photo).where(eq(schema.photo.id, 'jp1')).get()).toBeUndefined();
		expect(findOrphanedPhotos(db)).toEqual([]);
	});

	it('cleans up after photo deletion', async () => {
		seedContact('c1');
		seedPhoto({ id: 'p1', contactId: 'c1' });
		seedPhoto({ id: 'p2', contactId: 'c1', framingOf: 'p1' });
		const repo = createDrizzlePhotoRepository(db);
		const audit = makeAudit({
			kind: 'record.removed',
			recordKind: 'photo',
			recordId: 'p1',
			contactId: 'c1',
			person: 'c1',
			authorId: U1,
			authorName: 'One',
			visibility: 'shared'
		});

		expect(await repo.deleteRemovableGalleryPhoto(creator, 'p1', audit)).not.toBeNull();
		expect(db.select().from(schema.photo).where(eq(schema.photo.id, 'p1')).get()).toBeUndefined();
		// Framing should be gone too
		expect(db.select().from(schema.photo).where(eq(schema.photo.id, 'p2')).get()).toBeUndefined();
		expect(findOrphanedPhotos(db)).toEqual([]);
	});
});
