import { afterEach, beforeEach, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Remover } from '../access/visibility';
import type { ActivityOf } from '../domain/activity/activity';
import { sequentialIds } from '../domain/testing';
import { createDrizzleCircleRepository } from './circle-repository';
import { createDrizzleContactRepository } from './contact-repository';
import { createDrizzleJournalRepository } from './journal-repository';
import { createDrizzlePhotoRepository } from './photo-repository';
import * as schema from './schema';

const { contact, circle, circleMembership, journalEntry, photo } = schema;
const creator: Remover = { id: 'user-1', householdId: 'household-1', isAdmin: false };
const admin: Remover = { ...creator, isAdmin: true };
const { id: createdBy, householdId } = creator;
const auditFields = { id: 'log-1', householdId, actorId: createdBy, createdAt: 5000 };

let sqlite: Database;
let db: BunSQLiteDatabase<typeof schema>;

function orphanedPhotos() {
	const framedPhoto = alias(photo, 'framed_photo');
	const sourcePhoto = alias(photo, 'source_photo');
	return db
		.select({
			id: photo.id,
			framingOf: photo.framingOf,
			circleId: photo.circleId,
			cutFrom: photo.cutFrom,
			journalEntryId: photo.journalEntryId
		})
		.from(photo)
		.leftJoin(framedPhoto, eq(photo.framingOf, framedPhoto.id))
		.leftJoin(circle, eq(photo.circleId, circle.id))
		.leftJoin(sourcePhoto, eq(photo.cutFrom, sourcePhoto.id))
		.leftJoin(journalEntry, eq(photo.journalEntryId, journalEntry.id))
		.where(
			or(
				and(isNotNull(photo.framingOf), isNull(framedPhoto.id)),
				and(isNotNull(photo.circleId), isNull(circle.id)),
				and(isNotNull(photo.cutFrom), isNull(sourcePhoto.id)),
				and(isNotNull(photo.journalEntryId), isNull(journalEntry.id))
			)
		)
		.orderBy(photo.id)
		.all();
}

function seedPhoto(id: string, fields: Partial<typeof photo.$inferInsert>) {
	db.insert(photo)
		.values({
			id,
			householdId,
			createdBy,
			filePath: `${id}.jpg`,
			thumbPath: `${id}_thumb.jpg`,
			mime: 'image/jpeg',
			width: 512,
			height: 512,
			createdAt: 1000,
			...fields
		})
		.run();
}

beforeEach(() => {
	sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: householdId, name: 'Home' }).run();
	db.insert(schema.user)
		.values({ id: createdBy, householdId, email: 'creator@x.test', name: 'Creator', role: 'admin' })
		.run();
	db.insert(contact)
		.values([
			{ id: 'anna', householdId, createdBy, displayName: 'Anna' },
			{ id: 'ben', householdId, createdBy, displayName: 'Ben' }
		])
		.run();
	db.insert(circle).values({ id: 'class', householdId, createdBy, name: 'Class' }).run();
	db.insert(circleMembership)
		.values([
			{ id: 'class-anna', circleId: 'class', contactId: 'anna', createdBy },
			{ id: 'class-ben', circleId: 'class', contactId: 'ben', createdBy }
		])
		.run();
	db.insert(journalEntry)
		.values({
			id: 'moment',
			contactId: 'anna',
			subjectKey: 'anna',
			createdBy,
			entryDate: '2026-01-01',
			body: 'First day of class'
		})
		.run();

	const crop = { cropX: 100, cropY: 50, cropSize: 300 };
	seedPhoto('portrait', { contactId: 'anna' });
	seedPhoto('portrait-framing', { contactId: 'anna', framingOf: 'portrait', ...crop });
	seedPhoto('class-photo', { circleId: 'class' });
	seedPhoto('ben-cut', { contactId: 'ben', framingOf: 'class-photo', ...crop });
	// Anna switched away from her cut, so it is now a gallery photo that remembers its source.
	seedPhoto('anna-former-cut', { contactId: 'anna', cutFrom: 'class-photo' });
	seedPhoto('moment-photo', { contactId: 'anna', journalEntryId: 'moment' });
	db.update(contact).set({ avatarPhotoId: 'portrait-framing' }).where(eq(contact.id, 'anna')).run();
	db.update(contact).set({ avatarPhotoId: 'ben-cut' }).where(eq(contact.id, 'ben')).run();
	expect(orphanedPhotos()).toEqual([]);
});

afterEach(() => sqlite.close());

test('finds dangling photo references even when the rest of the graph is intact', () => {
	seedPhoto('dangling-framing', { contactId: 'anna', framingOf: 'missing-photo' });
	seedPhoto('dangling-circle', { circleId: 'missing-circle' });
	seedPhoto('dangling-cut', { contactId: 'ben', cutFrom: 'missing-photo' });

	expect(orphanedPhotos()).toMatchObject([
		{ id: 'dangling-circle', circleId: 'missing-circle' },
		{ id: 'dangling-cut', cutFrom: 'missing-photo' },
		{ id: 'dangling-framing', framingOf: 'missing-photo' }
	]);
});

test('deleting a contact leaves no dangling photo references', async () => {
	const audit: ActivityOf<'contact.deleted'> = {
		...auditFields,
		event: { kind: 'contact.deleted', contactId: 'anna', displayName: 'Anna', visibility: 'shared' }
	};
	const contacts = createDrizzleContactRepository(db);

	expect(await contacts.deleteDeletableBy(admin, 'anna', audit)).not.toBeNull();
	expect(db.select().from(contact).where(eq(contact.id, 'anna')).get()).toBeUndefined();
	expect(orphanedPhotos()).toEqual([]);
});

test('deleting a circle leaves no dangling photo references', async () => {
	const audit: ActivityOf<'circle.deleted'> = {
		...auditFields,
		event: { kind: 'circle.deleted', circleId: 'class', name: 'Class', visibility: 'shared' }
	};
	const circles = createDrizzleCircleRepository(db);

	expect(await circles.deleteDeletable(creator, 'class', audit)).not.toBeNull();
	expect(db.select().from(circle).where(eq(circle.id, 'class')).get()).toBeUndefined();
	expect(orphanedPhotos()).toEqual([]);
});

test('deleting a journal entry leaves no dangling photo references', async () => {
	const journal = createDrizzleJournalRepository(db, sequentialIds());

	expect(await journal.deleteRemovableBy(creator, 'moment', null)).not.toBeNull();
	expect(db.select().from(journalEntry).where(eq(journalEntry.id, 'moment')).get()).toBeUndefined();
	expect(orphanedPhotos()).toEqual([]);
});

test('deleting a gallery photo leaves no dangling photo references', async () => {
	const photos = createDrizzlePhotoRepository(db);

	expect(await photos.deleteRemovableGalleryPhoto(creator, 'portrait', null)).not.toBeNull();
	expect(db.select().from(photo).where(eq(photo.id, 'portrait')).get()).toBeUndefined();
	expect(orphanedPhotos()).toEqual([]);
});
