import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Remover } from '../access/visibility';
import { activityRecord, type ActivityOf } from '../domain/activity/activity';
import type { StoredCirclePhoto } from '../domain/circles/circle-photos';
import type { StoredPhoto } from '../domain/media/avatars';
import type { StoredFraming } from '../domain/media/framing';
import { fixedClock, sequentialIds } from '../domain/testing';
import { createDrizzleCirclePhotoRepository } from './circle-photo-repository';
import { createDrizzleCircleRepository } from './circle-repository';
import { createDrizzleContactRepository } from './contact-repository';
import { createDrizzleCutRepository } from './cut-repository';
import { createDrizzleFramingRepository } from './framing-repository';
import { createDrizzleJournalRepository } from './journal-repository';
import { createDrizzlePhotoRepository } from './photo-repository';
import * as schema from './schema';

/*
 * Integration spec for the photos that point at other rows (docs/dev/03 `photo`, review finding
 * A-09): `framing_of`, `circle_id` and `cut_from` carry no foreign key and `journal_entry_id`
 * carries no cascade, so only the repositories keep a photo from outliving what it names. Each
 * delete path the app uses is driven here against a real database, and afterwards one query over
 * every photo row asks whether any of the four still names a row that is gone. A forgotten
 * cleanup leaves a row behind that is invisible until an export reads the database against disk.
 */

const H = 'household-1';
const U1 = 'user-1';
const admin: Remover = { id: U1, householdId: H, isAdmin: true };
const author: Remover = { id: U1, householdId: H, isAdmin: false };

let db: BunSQLiteDatabase<typeof schema>;

function seedContact(id: string) {
	db.insert(schema.contact)
		.values({ id, householdId: H, createdBy: U1, visibility: 'shared', displayName: id })
		.run();
}

function seedCircle(id: string) {
	db.insert(schema.circle)
		.values({ id, householdId: H, createdBy: U1, visibility: 'shared', name: id })
		.run();
}

function seedJournalEntry(id: string, contactId: string) {
	db.insert(schema.journalEntry)
		.values({
			id,
			contactId,
			subjectKey: contactId,
			createdBy: U1,
			entryDate: '2026-01-01',
			body: 'x'
		})
		.run();
}

const photo = (over: Partial<StoredPhoto> = {}): StoredPhoto => ({
	id: 'anna-photo',
	householdId: H,
	contactId: 'anna',
	journalEntryId: null,
	createdBy: U1,
	visibility: 'shared',
	filePath: 'anna.jpg',
	thumbPath: 'anna_t.jpg',
	mime: 'image/jpeg',
	width: 512,
	height: 512,
	sizeBytes: 100,
	takenAt: null,
	createdAt: 1000,
	...over
});

const circlePhoto = (over: Partial<StoredCirclePhoto> = {}): StoredCirclePhoto => ({
	id: 'class-photo',
	householdId: H,
	circleId: 'class',
	circleRole: null,
	createdBy: U1,
	visibility: 'shared',
	filePath: 'class.jpg',
	thumbPath: 'class_t.jpg',
	viewPath: 'class_v.jpg',
	mime: 'image/jpeg',
	width: 4096,
	height: 2731,
	sizeBytes: 100,
	takenAt: null,
	createdAt: 1000,
	...over
});

const framing = (over: Partial<StoredFraming> = {}): StoredFraming => ({
	...photo({ id: 'anna-framing', filePath: 'anna-framing.jpg', thumbPath: 'anna-framing_t.jpg' }),
	framingOf: 'anna-photo',
	crop: { x: 100, y: 50, size: 300 },
	...over
});

const cut = (over: Partial<StoredFraming> = {}): StoredFraming => ({
	...photo({ id: 'cut-anna', filePath: 'cut-anna.jpg', thumbPath: 'cut-anna_t.jpg' }),
	framingOf: 'class-photo',
	crop: { x: 100, y: 200, size: 300 },
	...over
});

const contactAudit = (remover: Remover): ActivityOf<'contact.deleted'> =>
	activityRecord({ ids: sequentialIds('log-contact'), clock: fixedClock(5000) }, remover, {
		kind: 'contact.deleted',
		contactId: 'anna',
		displayName: 'Anna',
		visibility: 'shared'
	});

const circleAudit = (remover: Remover): ActivityOf<'circle.deleted'> =>
	activityRecord({ ids: sequentialIds('log-circle'), clock: fixedClock(5000) }, remover, {
		kind: 'circle.deleted',
		circleId: 'class',
		name: 'class',
		visibility: 'shared'
	});

const contactRow = (id: string) =>
	db.select().from(schema.contact).where(eq(schema.contact.id, id)).get();
const circleRow = (id: string) =>
	db.select().from(schema.circle).where(eq(schema.circle.id, id)).get();
const journalRow = (id: string) =>
	db.select().from(schema.journalEntry).where(eq(schema.journalEntry.id, id)).get();
const photoRow = (id: string) =>
	db.select().from(schema.photo).where(eq(schema.photo.id, id)).get();

/*
 * Every photo whose `framing_of`, `cut_from`, `circle_id` or `journal_entry_id` names a row that
 * no longer exists — one query, no hand-picked ids. A check that counts photos pointing at one
 * gone id would pass trivially once that id's row is deleted; this asks the question of every row.
 */
const framedPhoto = alias(schema.photo, 'framed_photo');
const cutFromPhoto = alias(schema.photo, 'cut_from_photo');

const orphanPhotos = () =>
	db
		.select({
			id: schema.photo.id,
			framingOf: schema.photo.framingOf,
			circleId: schema.photo.circleId,
			cutFrom: schema.photo.cutFrom,
			journalEntryId: schema.photo.journalEntryId
		})
		.from(schema.photo)
		.leftJoin(framedPhoto, eq(framedPhoto.id, schema.photo.framingOf))
		.leftJoin(cutFromPhoto, eq(cutFromPhoto.id, schema.photo.cutFrom))
		.leftJoin(schema.circle, eq(schema.circle.id, schema.photo.circleId))
		.leftJoin(schema.journalEntry, eq(schema.journalEntry.id, schema.photo.journalEntryId))
		.where(
			or(
				and(isNotNull(schema.photo.framingOf), isNull(framedPhoto.id)),
				and(isNotNull(schema.photo.cutFrom), isNull(cutFromPhoto.id)),
				and(isNotNull(schema.photo.circleId), isNull(schema.circle.id)),
				and(isNotNull(schema.photo.journalEntryId), isNull(schema.journalEntry.id))
			)
		)
		.all();

beforeEach(async () => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user).values({ id: U1, householdId: H, email: 'u1@x.test', name: 'One' }).run();

	// The rows that point at each other, made the way the app makes them: Anna has a gallery
	// photo and a framing of it, a cut of the class group photo and a cut already turned into a
	// photo of her own, plus a journal entry with a photo.
	seedContact('anna');
	seedCircle('class');
	seedJournalEntry('j-anna', 'anna');

	const photos = createDrizzlePhotoRepository(db);
	await photos.insert(photo({ id: 'anna-photo' }));
	await photos.insert(
		photo({
			id: 'journal-photo',
			journalEntryId: 'j-anna',
			filePath: 'journal.jpg',
			thumbPath: 'journal_t.jpg'
		})
	);
	await createDrizzleFramingRepository(db).replaceFraming(framing({}));
	await createDrizzleCirclePhotoRepository(db).insert(circlePhoto({}));
	await createDrizzleCutRepository(db).replaceCut(cut({}));
	db.insert(schema.photo)
		.values({
			id: 'anna-cut-photo',
			householdId: H,
			contactId: 'anna',
			createdBy: U1,
			visibility: 'shared',
			framingOf: null,
			cutFrom: 'class-photo',
			filePath: 'anna-cut.jpg',
			thumbPath: 'anna-cut_t.jpg',
			mime: 'image/jpeg'
		})
		.run();
});

describe('a photo never outlives what it names (A-09)', () => {
	it('finds a planted dangling row, so an empty answer means something', () => {
		db.insert(schema.photo)
			.values({
				id: 'dangling',
				householdId: H,
				createdBy: U1,
				framingOf: 'no-such-photo',
				cutFrom: 'no-such-photo',
				circleId: 'no-such-circle',
				filePath: 'dangling.jpg',
				thumbPath: 'dangling_t.jpg',
				mime: 'image/jpeg'
			})
			.run();

		expect(orphanPhotos().map((p) => p.id)).toEqual(['dangling']);
	});

	it('leaves nothing behind when a contact goes', async () => {
		expect(
			await createDrizzleContactRepository(db).deleteDeletableBy(admin, 'anna', contactAudit(admin))
		).not.toBeNull();

		expect(contactRow('anna')).toBeUndefined();
		expect(orphanPhotos()).toEqual([]);
	});

	it('leaves nothing behind when a circle goes', async () => {
		expect(
			await createDrizzleCircleRepository(db).deleteDeletable(author, 'class', circleAudit(author))
		).not.toBeNull();

		expect(circleRow('class')).toBeUndefined();
		expect(orphanPhotos()).toEqual([]);
	});

	it('leaves nothing behind when a journal entry goes', async () => {
		const journal = createDrizzleJournalRepository(db, sequentialIds('tag-1'));

		expect(await journal.deleteRemovableBy(author, 'j-anna', null)).not.toBeNull();
		expect(journalRow('j-anna')).toBeUndefined();
		expect(orphanPhotos()).toEqual([]);
	});

	it('leaves nothing behind when a gallery photo goes', async () => {
		const photos = createDrizzlePhotoRepository(db);

		expect(await photos.deleteRemovableGalleryPhoto(author, 'anna-photo', null)).not.toBeNull();
		expect(photoRow('anna-photo')).toBeUndefined();
		expect(orphanPhotos()).toEqual([]);
	});
});
