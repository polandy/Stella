import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Remover } from '../access/visibility';
import { activityRecord, type ActivityOf } from '../domain/activity/activity';
import type { StoredCirclePhoto } from '../domain/circles/circle-photos';
import type { CircleRepository } from '../domain/circles/circles';
import type { PhotoRepository, StoredPhoto } from '../domain/media/avatars';
import type { FramingRepository, StoredFraming } from '../domain/media/framing';
import { fixedClock, sequentialIds } from '../domain/testing';
import type { IdGenerator } from '../id';
import { createDrizzleCirclePhotoRepository } from './circle-photo-repository';
import { createDrizzleCircleRepository } from './circle-repository';
import { createDrizzleContactRepository } from './contact-repository';
import { createDrizzleCutRepository } from './cut-repository';
import { createDrizzleFramingRepository } from './framing-repository';
import { createDrizzleJournalRepository } from './journal-repository';
import { createDrizzlePhotoRepository } from './photo-repository';
import * as schema from './schema';

/*
 * Finding A-09: nothing in the database stops a photo row from outliving what it points at —
 * `photo.framing_of`, `photo.circle_id` and `photo.cut_from` carry no foreign key and
 * `photo.journal_entry_id` none with a cascade (docs/dev/03 `photo`), so every delete path clears
 * them by hand, one at a time. A forgotten one would leave photo rows — and their files — behind,
 * which only shows up in an export ("is in the database but not on disk"). This spec drives the
 * delete paths the app uses — a contact, a circle, a moment, a gallery photo — against a real
 * database and, after each, runs one check over every photo row for one whose reference names a
 * row that is no longer there.
 */

const H = 'household-1';
const U1 = 'user-1';
// Deleting a contact is an admin's alone (docs/dev/03 §3.7); the rest a row's creator may do.
const creator: Remover = { id: U1, householdId: H, isAdmin: false };
const admin: Remover = { id: U1, householdId: H, isAdmin: true };

const ids: IdGenerator = { next: () => 'id-orphans' };

let db: BunSQLiteDatabase<typeof schema>;
let contacts: ReturnType<typeof createDrizzleContactRepository>;
let circles: CircleRepository;
let moments: ReturnType<typeof createDrizzleJournalRepository>;
let photos: PhotoRepository;
let circlePhotos: ReturnType<typeof createDrizzleCirclePhotoRepository>;
let framings: FramingRepository;
let cuts: ReturnType<typeof createDrizzleCutRepository>;

function seedContact(id: string) {
	db.insert(schema.contact)
		.values({ id, householdId: H, createdBy: U1, visibility: 'shared', displayName: id })
		.run();
}

function seedCircle(id: string, members: string[]) {
	db.insert(schema.circle)
		.values({ id, householdId: H, createdBy: U1, visibility: 'shared', name: id })
		.run();
	for (const contactId of members) {
		db.insert(schema.circleMembership)
			.values({ id: `${id}-${contactId}`, circleId: id, contactId, createdBy: U1 })
			.run();
	}
}

const photoOf = (over: Partial<StoredPhoto> = {}): StoredPhoto => ({
	takenAt: null,
	id: 'g-mara',
	householdId: H,
	contactId: 'mara',
	journalEntryId: null,
	createdBy: U1,
	visibility: 'shared',
	filePath: 'g-mara.jpg',
	thumbPath: 'g-mara_t.jpg',
	mime: 'image/jpeg',
	width: 512,
	height: 512,
	sizeBytes: 1234,
	createdAt: 100,
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

/** A framing: the square someone wears of `framingOf`, a photo row of its own (docs/dev/03 `photo`). */
const framing = (over: Partial<StoredFraming> = {}): StoredFraming => ({
	...photoOf({ id: 'f-mara', filePath: 'f-mara.jpg', thumbPath: 'f-mara_t.jpg', createdAt: 9000 }),
	framingOf: 'g-mara',
	crop: { x: 100, y: 200, size: 300 },
	...over
});

/** A cut: the same shape, of the class's group photo, worn by its person. */
const cutOf = (over: Partial<StoredFraming> = {}): StoredFraming =>
	framing({
		id: 'cut-anna',
		contactId: 'anna',
		framingOf: 'class-photo',
		filePath: 'cut-anna.jpg',
		thumbPath: 'cut-anna_t.jpg',
		...over
	});

/** The photo a `framing_of` names, and the one a `cut_from` remembers, beside their referrers. */
const framedPhoto = alias(schema.photo, 'framed_photo');
const cutSource = alias(schema.photo, 'cut_source');

/**
 * Every photo row whose `framing_of`, `cut_from`, `circle_id` or `journal_entry_id` names a row
 * that is not there. One query over every photo row, not a count against a hand-picked id: a
 * count of photos pointing at X passes trivially once X's table is empty. `journal_entry_id`
 * carries a foreign key, so the database already refuses a dangling one; the other three columns
 * are what this check exists for.
 */
function orphanPhotos() {
	return db
		.select({
			id: schema.photo.id,
			framingOf: schema.photo.framingOf,
			cutFrom: schema.photo.cutFrom,
			circleId: schema.photo.circleId,
			journalEntryId: schema.photo.journalEntryId
		})
		.from(schema.photo)
		.leftJoin(framedPhoto, eq(framedPhoto.id, schema.photo.framingOf))
		.leftJoin(cutSource, eq(cutSource.id, schema.photo.cutFrom))
		.leftJoin(schema.circle, eq(schema.circle.id, schema.photo.circleId))
		.leftJoin(schema.journalEntry, eq(schema.journalEntry.id, schema.photo.journalEntryId))
		.where(
			or(
				and(isNotNull(schema.photo.framingOf), isNull(framedPhoto.id)),
				and(isNotNull(schema.photo.cutFrom), isNull(cutSource.id)),
				and(isNotNull(schema.photo.circleId), isNull(schema.circle.id)),
				and(isNotNull(schema.photo.journalEntryId), isNull(schema.journalEntry.id))
			)
		)
		.all();
}

const photoRow = (id: string) =>
	db.select().from(schema.photo).where(eq(schema.photo.id, id)).get();
const circleRow = (id: string) =>
	db.select().from(schema.circle).where(eq(schema.circle.id, id)).get();
const contactRow = (id: string) =>
	db.select().from(schema.contact).where(eq(schema.contact.id, id)).get();
const entryRow = (id: string) =>
	db.select().from(schema.journalEntry).where(eq(schema.journalEntry.id, id)).get();

const contactAudit = (): ActivityOf<'contact.deleted'> => ({
	id: 'log-1',
	householdId: H,
	actorId: U1,
	createdAt: 5000,
	event: {
		kind: 'contact.deleted',
		contactId: 'mara',
		displayName: 'mara',
		visibility: 'shared'
	}
});

const circleAudit = (remover: Remover) =>
	activityRecord({ ids: sequentialIds('log-1'), clock: fixedClock(5000) }, remover, {
		kind: 'circle.deleted',
		circleId: 'class',
		name: 'class',
		visibility: 'shared'
	});

beforeEach(async () => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user)
		.values([{ id: U1, householdId: H, email: 'u1@x.test', name: 'One' }])
		.run();
	contacts = createDrizzleContactRepository(db);
	circles = createDrizzleCircleRepository(db);
	moments = createDrizzleJournalRepository(db, ids);
	photos = createDrizzlePhotoRepository(db);
	circlePhotos = createDrizzleCirclePhotoRepository(db);
	framings = createDrizzleFramingRepository(db);
	cuts = createDrizzleCutRepository(db);

	// One of everything that points: Mara's gallery photo and the square she wears of it, the
	// class's group photo with a cut Anna still wears and one that already became Ben's own photo
	// (it still names the group photo), and a moment of Mara's with its photo.
	seedContact('mara');
	seedContact('anna');
	seedContact('ben');
	seedCircle('class', ['anna', 'ben']);
	db.insert(schema.journalEntry)
		.values({
			id: 'j-moment',
			contactId: 'mara',
			subjectKey: 'mara',
			createdBy: U1,
			entryDate: '2026-01-01',
			body: 'a moment'
		})
		.run();
	await circlePhotos.insert(circlePhoto());
	await photos.insert(photoOf({ id: 'g-mara', createdAt: 100 }));
	await framings.replaceFraming(framing());
	await cuts.replaceCut(cutOf({ id: 'cut-anna', createdAt: 9100 }));
	await cuts.replaceCut(
		cutOf({
			id: 'cut-ben',
			contactId: 'ben',
			filePath: 'cut-ben.jpg',
			thumbPath: 'cut-ben_t.jpg',
			createdAt: 9200
		})
	);
	// A new picture for Ben turns the cut he wore into a photo of his own (docs/dev/02 §2.14).
	await photos.insert(
		photoOf({
			id: 'g-ben',
			contactId: 'ben',
			filePath: 'g-ben.jpg',
			thumbPath: 'g-ben_t.jpg',
			createdAt: 9300
		})
	);
	await photos.setContactAvatar('ben', 'g-ben');
	await photos.insert(
		photoOf({
			id: 'p-moment',
			journalEntryId: 'j-moment',
			filePath: 'moment.jpg',
			thumbPath: 'moment_t.jpg',
			createdAt: 9400
		})
	);
});

describe('no photo outlives what it points at', () => {
	it('deleting a contact takes their photos, their framing and their moment’s photo', async () => {
		expect(await contacts.deleteDeletableBy(admin, 'mara', contactAudit())).not.toBeNull();

		expect(contactRow('mara')).toBeUndefined();
		expect(entryRow('j-moment')).toBeUndefined();
		expect(photoRow('g-mara')).toBeUndefined();
		expect(photoRow('f-mara')).toBeUndefined();
		expect(photoRow('p-moment')).toBeUndefined();
		// Nobody else's photos are theirs to take: the check runs over a table that still has rows.
		expect(photoRow('class-photo')).toBeDefined();
		expect(orphanPhotos()).toEqual([]);
	});

	it('deleting a circle takes its photos and turns the cuts worn of them first', async () => {
		expect(await circles.deleteDeletable(creator, 'class', circleAudit(creator))).not.toBeNull();

		expect(circleRow('class')).toBeUndefined();
		expect(photoRow('class-photo')).toBeUndefined();
		// Anna's cut became her own photo; Ben's forgets the group photo it came from.
		expect(photoRow('cut-anna')).toMatchObject({ framingOf: null, cutFrom: null });
		expect(photoRow('cut-ben')).toMatchObject({ framingOf: null, cutFrom: null });
		// Mara's things are not the circle's to take.
		expect(photoRow('g-mara')).toBeDefined();
		expect(orphanPhotos()).toEqual([]);
	});

	it('deleting a moment takes its photo', async () => {
		expect(await moments.deleteRemovableBy(creator, 'j-moment', null)).toEqual([
			{ filePath: 'moment.jpg', thumbPath: 'moment_t.jpg' }
		]);

		expect(entryRow('j-moment')).toBeUndefined();
		expect(photoRow('p-moment')).toBeUndefined();
		expect(photoRow('g-mara')).toBeDefined();
		expect(orphanPhotos()).toEqual([]);
	});

	it('deleting a gallery photo takes the framing worn of it', async () => {
		expect(await photos.deleteRemovableGalleryPhoto(creator, 'g-mara', null)).toEqual([
			{ filePath: 'g-mara.jpg', thumbPath: 'g-mara_t.jpg' },
			{ filePath: 'f-mara.jpg', thumbPath: 'f-mara_t.jpg' }
		]);

		expect(photoRow('g-mara')).toBeUndefined();
		expect(photoRow('f-mara')).toBeUndefined();
		// The moment and its photo are not the gallery photo's to take.
		expect(entryRow('j-moment')).toBeDefined();
		expect(orphanPhotos()).toEqual([]);
	});

	it('the check finds a photo row left pointing at a row that is gone', () => {
		// No app path writes these — that is the point; only a forgotten cleanup would. A dangling
		// `journal_entry_id` cannot even be planted: that column carries its foreign key.
		db.insert(schema.photo)
			.values([
				{
					id: 'dangling-framing',
					householdId: H,
					framingOf: 'gone-photo',
					createdBy: U1,
					filePath: 'd1.jpg',
					thumbPath: 'd1_t.jpg',
					mime: 'image/jpeg'
				},
				{
					id: 'dangling-cut',
					householdId: H,
					cutFrom: 'gone-photo',
					createdBy: U1,
					filePath: 'd2.jpg',
					thumbPath: 'd2_t.jpg',
					mime: 'image/jpeg'
				},
				{
					id: 'dangling-circle',
					householdId: H,
					circleId: 'gone-circle',
					createdBy: U1,
					filePath: 'd3.jpg',
					thumbPath: 'd3_t.jpg',
					mime: 'image/jpeg'
				}
			])
			.run();

		expect(
			orphanPhotos()
				.map((row) => row.id)
				.sort()
		).toEqual(['dangling-circle', 'dangling-cut', 'dangling-framing']);
	});
});
