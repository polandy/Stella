import { afterEach, beforeEach, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Remover } from '../access/visibility';
import { activityRecord, type ActivityOf } from '../domain/activity/activity';
import { fixedClock, sequentialIds } from '../domain/testing';
import { createDrizzleCircleRepository } from './circle-repository';
import { createDrizzleContactRepository } from './contact-repository';
import { createDrizzleJournalRepository } from './journal-repository';
import { createDrizzlePhotoRepository } from './photo-repository';
import * as schema from './schema';
import { circle, contact, journalEntry, photo } from './schema';

const H = 'household-1';
const U1 = 'user-1';
const creator: Remover = { id: U1, householdId: H, isAdmin: false };
const admin: Remover = { ...creator, isAdmin: true };

let sqlite: Database;
let db: BunSQLiteDatabase<typeof schema>;

function photoFixture(id: string, fields: Partial<typeof photo.$inferInsert>) {
	return {
		id,
		householdId: H,
		createdBy: U1,
		filePath: `${id}.jpg`,
		thumbPath: `${id}_thumb.jpg`,
		mime: 'image/jpeg',
		createdAt: 1_000,
		...fields
	};
}

function orphanedPhotos() {
	const framed = alias(photo, 'framed');
	const cutSource = alias(photo, 'cut_source');
	// Start from photos so a missing parent (even an empty parent table) cannot hide a reference.
	return db
		.select({
			id: photo.id,
			framingOf: photo.framingOf,
			circleId: photo.circleId,
			cutFrom: photo.cutFrom,
			journalEntryId: photo.journalEntryId
		})
		.from(photo)
		.leftJoin(framed, eq(photo.framingOf, framed.id))
		.leftJoin(circle, eq(photo.circleId, circle.id))
		.leftJoin(cutSource, eq(photo.cutFrom, cutSource.id))
		.leftJoin(journalEntry, eq(photo.journalEntryId, journalEntry.id))
		.where(
			or(
				and(isNotNull(photo.framingOf), isNull(framed.id)),
				and(isNotNull(photo.circleId), isNull(circle.id)),
				and(isNotNull(photo.cutFrom), isNull(cutSource.id)),
				and(isNotNull(photo.journalEntryId), isNull(journalEntry.id))
			)
		)
		.orderBy(photo.id)
		.all();
}

beforeEach(() => {
	sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: H, name: 'Household' }).run();
	db.insert(schema.user).values({ id: U1, householdId: H, email: 'u1@x.test', name: 'One' }).run();
	db.insert(contact)
		.values([
			{ id: 'mara', householdId: H, createdBy: U1, displayName: 'Mara' },
			{ id: 'ben', householdId: H, createdBy: U1, displayName: 'Ben' }
		])
		.run();
	db.insert(circle).values({ id: 'class', householdId: H, createdBy: U1, name: 'Class' }).run();
	db.insert(schema.circleMembership)
		.values([
			{ id: 'class-mara', circleId: 'class', contactId: 'mara', createdBy: U1 },
			{ id: 'class-ben', circleId: 'class', contactId: 'ben', createdBy: U1 }
		])
		.run();
	db.insert(journalEntry)
		.values({
			id: 'moment',
			contactId: 'mara',
			subjectKey: 'mara',
			createdBy: U1,
			entryDate: '2026-01-01',
			body: 'First day of class'
		})
		.run();
	const crop = { cropX: 100, cropY: 50, cropSize: 300 };
	db.insert(photo)
		.values([
			photoFixture('portrait', { contactId: 'mara' }),
			photoFixture('portrait-framing', { contactId: 'mara', framingOf: 'portrait', ...crop }),
			photoFixture('class-photo', { circleId: 'class', contactId: null }),
			photoFixture('worn-cut', { contactId: 'ben', framingOf: 'class-photo', ...crop }),
			photoFixture('former-cut', { contactId: 'mara', cutFrom: 'class-photo', framingOf: null }),
			photoFixture('moment-photo', { contactId: 'mara', journalEntryId: 'moment' })
		])
		.run();
	db.update(contact).set({ avatarPhotoId: 'portrait-framing' }).where(eq(contact.id, 'mara')).run();
	db.update(contact).set({ avatarPhotoId: 'worn-cut' }).where(eq(contact.id, 'ben')).run();
});

afterEach(() => sqlite.close());

test('finds photos with dangling references but not photos with valid or null references', () => {
	db.insert(photo)
		.values([
			photoFixture('bad-framing', { contactId: 'mara', framingOf: 'missing-photo' }),
			photoFixture('bad-circle', { circleId: 'missing-circle' }),
			photoFixture('bad-cut', { contactId: 'ben', cutFrom: 'missing-group-photo' })
		])
		.run();
	// journalEntryId cannot be planted dangling while SQLite enforces foreign keys.
	expect(orphanedPhotos().map((row) => row.id)).toEqual(['bad-circle', 'bad-cut', 'bad-framing']);
});

test('deleting a contact leaves no orphaned photos', async () => {
	const audit: ActivityOf<'contact.deleted'> = activityRecord(
		{ ids: sequentialIds('log-1'), clock: fixedClock(5_000) },
		admin,
		{ kind: 'contact.deleted', contactId: 'mara', displayName: 'Mara', visibility: 'shared' }
	);
	const contacts = createDrizzleContactRepository(db);

	expect(await contacts.deleteDeletableBy(admin, 'mara', audit)).not.toBeNull();
	expect(db.select().from(contact).where(eq(contact.id, 'mara')).get()).toBeUndefined();
	expect(orphanedPhotos()).toEqual([]);
});

test('deleting a circle leaves no orphaned photos', async () => {
	const audit: ActivityOf<'circle.deleted'> = activityRecord(
		{ ids: sequentialIds('log-1'), clock: fixedClock(5_000) },
		creator,
		{ kind: 'circle.deleted', circleId: 'class', name: 'Class', visibility: 'shared' }
	);
	const circles = createDrizzleCircleRepository(db);

	expect(await circles.deleteDeletable(creator, 'class', audit)).not.toBeNull();
	expect(db.select().from(circle).where(eq(circle.id, 'class')).get()).toBeUndefined();
	expect(orphanedPhotos()).toEqual([]);
});

test('deleting a journal entry leaves no orphaned photos', async () => {
	const journal = createDrizzleJournalRepository(db, sequentialIds());

	expect(await journal.deleteRemovableBy(creator, 'moment', null)).not.toBeNull();
	expect(db.select().from(journalEntry).where(eq(journalEntry.id, 'moment')).get()).toBeUndefined();
	expect(orphanedPhotos()).toEqual([]);
});

test('deleting a gallery photo leaves no orphaned photos', async () => {
	const photos = createDrizzlePhotoRepository(db);

	expect(await photos.deleteRemovableGalleryPhoto(creator, 'portrait', null)).not.toBeNull();
	expect(db.select().from(photo).where(eq(photo.id, 'portrait')).get()).toBeUndefined();
	expect(orphanedPhotos()).toEqual([]);
});
