import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq, sql } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Remover } from '../access/visibility';
import type { ActivityOf } from '../domain/activity/activity';
import type { StoredCirclePhoto } from '../domain/circles/circle-photos';
import type { CircleRepository } from '../domain/circles/circles';
import type { StoredPhoto } from '../domain/media/avatars';
import type { FramingRepository, StoredFraming } from '../domain/media/framing';
import type { JournalRepository } from '../domain/journal/journal';
import { createDrizzleCirclePhotoRepository } from './circle-photo-repository';
import { createDrizzleCircleRepository } from './circle-repository';
import { createDrizzleContactRepository } from './contact-repository';
import { createDrizzleCutRepository } from './cut-repository';
import { createDrizzleFramingRepository } from './framing-repository';
import { createDrizzleJournalRepository } from './journal-repository';
import { createDrizzlePhotoRepository } from './photo-repository';
import * as schema from './schema';

/*
 * The photo references that carry no foreign key — `framing_of`, `circle_id`, `cut_from` — are kept
 * in step by the repositories that remove their targets, and `journal_entry_id` has a foreign key
 * but no cascade. Nothing outside the individual delete specs checks the whole set, so this spec
 * builds every shape the app makes and then, after each deletion through the real code path,
 * asks one generic question: does any photo still point at a row that is gone?
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
const admin: Remover = { id: U1, householdId: H, isAdmin: true };
const creator: Remover = { id: U1, householdId: H, isAdmin: false };
const viewerU1 = { id: U1, householdId: H };

const contactAudit: ActivityOf<'contact.deleted'> = {
	id: 'log-contact',
	householdId: H,
	actorId: U1,
	createdAt: 5000,
	event: {
		kind: 'contact.deleted',
		contactId: 'anna',
		displayName: 'Anna',
		visibility: 'shared'
	}
};

const circleAudit: ActivityOf<'circle.deleted'> = {
	id: 'log-circle',
	householdId: H,
	actorId: U1,
	createdAt: 5000,
	event: { kind: 'circle.deleted', circleId: 'class', name: 'Class', visibility: 'shared' }
};

let db: BunSQLiteDatabase<typeof schema>;
let contacts: ReturnType<typeof createDrizzleContactRepository>;
let circles: CircleRepository;
let circlePhotos: ReturnType<typeof createDrizzleCirclePhotoRepository>;
let cuts: ReturnType<typeof createDrizzleCutRepository>;
let framings: FramingRepository;
let photos: ReturnType<typeof createDrizzlePhotoRepository>;
let journal: JournalRepository;

const galleryPhoto = (over: Partial<StoredPhoto> = {}): StoredPhoto => ({
	takenAt: null,
	id: 'anna-gallery',
	householdId: H,
	contactId: 'anna',
	journalEntryId: null,
	createdBy: U1,
	visibility: 'shared',
	filePath: 'anna-gallery.jpg',
	thumbPath: 'anna-gallery_t.jpg',
	mime: 'image/jpeg',
	width: 512,
	height: 512,
	sizeBytes: 100,
	createdAt: 100,
	...over
});

const framingOf = (over: Partial<StoredFraming> = {}): StoredFraming => ({
	id: 'anna-framing',
	householdId: H,
	contactId: 'anna',
	journalEntryId: null,
	framingOf: 'anna-gallery',
	crop: { x: 0, y: 0, size: 256 },
	createdBy: U1,
	visibility: 'shared',
	filePath: 'anna-framing.jpg',
	thumbPath: 'anna-framing_t.jpg',
	mime: 'image/jpeg',
	width: 256,
	height: 256,
	sizeBytes: 50,
	createdAt: 150,
	...over
});

const cutOf = (over: Partial<StoredFraming> = {}): StoredFraming => ({
	id: 'cut-ben',
	householdId: H,
	contactId: 'ben',
	journalEntryId: null,
	framingOf: 'class-photo',
	crop: { x: 100, y: 200, size: 300 },
	createdBy: U1,
	visibility: 'shared',
	filePath: 'cut-ben.jpg',
	thumbPath: 'cut-ben_t.jpg',
	mime: 'image/jpeg',
	width: 1024,
	height: 1024,
	sizeBytes: 50,
	createdAt: 300,
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
	createdAt: 250,
	...over
});

interface PhotoOrphan {
	id: string;
	framing_of: string | null;
	circle_id: string | null;
	cut_from: string | null;
	journal_entry_id: string | null;
}

/**
 * Every photo row whose `framing_of`, `cut_from`, `circle_id` or `journal_entry_id` names a row that
 * is not there. One query over every photo, so no id has to be known: a check that counts photos
 * pointing at a particular row would pass trivially once that row's table is empty.
 */
function orphans(): PhotoOrphan[] {
	return db.all<PhotoOrphan>(sql`
		SELECT p.id AS id, p.framing_of AS framing_of, p.circle_id AS circle_id,
			p.cut_from AS cut_from, p.journal_entry_id AS journal_entry_id
		FROM photo p
		WHERE (p.framing_of IS NOT NULL
				AND NOT EXISTS (SELECT 1 FROM photo framed WHERE framed.id = p.framing_of))
			OR (p.cut_from IS NOT NULL
				AND NOT EXISTS (SELECT 1 FROM photo cut WHERE cut.id = p.cut_from))
			OR (p.circle_id IS NOT NULL
				AND NOT EXISTS (SELECT 1 FROM circle c WHERE c.id = p.circle_id))
			OR (p.journal_entry_id IS NOT NULL
				AND NOT EXISTS (SELECT 1 FROM journal_entry j WHERE j.id = p.journal_entry_id))
	`);
}

const photoRow = (id: string) =>
	db.select().from(schema.photo).where(eq(schema.photo.id, id)).get();
const circleRow = (id: string) =>
	db.select().from(schema.circle).where(eq(schema.circle.id, id)).get();
const journalRow = (id: string) =>
	db.select().from(schema.journalEntry).where(eq(schema.journalEntry.id, id)).get();

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
	db.insert(schema.contact)
		.values([
			{ id: 'anna', householdId: H, createdBy: U1, visibility: 'shared', displayName: 'Anna' },
			{ id: 'ben', householdId: H, createdBy: U1, visibility: 'shared', displayName: 'Ben' }
		])
		.run();
	db.insert(schema.circle)
		.values({ id: 'class', householdId: H, createdBy: U1, visibility: 'shared', name: 'Class' })
		.run();

	contacts = createDrizzleContactRepository(db);
	circles = createDrizzleCircleRepository(db);
	circlePhotos = createDrizzleCirclePhotoRepository(db);
	cuts = createDrizzleCutRepository(db);
	framings = createDrizzleFramingRepository(db);
	photos = createDrizzlePhotoRepository(db);
	journal = createDrizzleJournalRepository(db, { next: () => 'next-id' });

	// Anna's gallery photo and the framing she chose from it.
	await photos.insert(galleryPhoto());
	await framings.replaceFraming(framingOf());

	// The circle's group photo and Ben's cut of it: a framing that belongs to him.
	await circlePhotos.insert(circlePhoto());
	await cuts.replaceCut(cutOf());

	// A cut Anna wore and then stopped wearing: it became a photo of her own remembering the
	// group photo (`cut_from`), with no framing left.
	await cuts.replaceCut(
		cutOf({
			id: 'anna-cut',
			contactId: 'anna',
			filePath: 'anna-cut.jpg',
			thumbPath: 'anna-cut_t.jpg'
		})
	);
	await photos.setContactAvatar('anna', 'anna-gallery');

	// A moment about Ben, with its own photo.
	db.insert(schema.journalEntry)
		.values({
			id: 'moment-1',
			contactId: 'ben',
			subjectKey: 'ben',
			createdBy: U1,
			visibility: 'shared',
			entryDate: '2026-01-01',
			body: 'A moment'
		})
		.run();
	await photos.insert(
		galleryPhoto({
			id: 'moment-photo',
			contactId: 'ben',
			journalEntryId: 'moment-1',
			filePath: 'moment.jpg',
			thumbPath: 'moment_t.jpg',
			createdAt: 200
		})
	);

	// The fixture is the app's own shape, so the check must find nothing in it to begin with.
	expect(orphans()).toEqual([]);
});

describe('deleting a contact', () => {
	it('takes their photos, framings and earlier cuts, and leaves no photo pointing at nothing', async () => {
		expect(await contacts.deleteDeletableBy(admin, 'anna', contactAudit)).not.toBeNull();

		expect(await contacts.findByIdVisibleTo(viewerU1, 'anna')).toBeNull();
		expect(photoRow('anna-gallery')).toBeUndefined();
		expect(photoRow('anna-framing')).toBeUndefined();
		expect(photoRow('anna-cut')).toBeUndefined();
		// Positive control: other people's photos and the circle's own photo are untouched.
		expect(photoRow('cut-ben')).toBeDefined();
		expect(photoRow('class-photo')).toBeDefined();
		expect(photoRow('moment-photo')).toBeDefined();
		expect(orphans()).toEqual([]);
	});
});

describe('deleting a circle', () => {
	it('takes its photo and turns its cuts, and leaves no photo pointing at nothing', async () => {
		expect(await circles.deleteDeletable(creator, 'class', circleAudit)).not.toBeNull();

		expect(circleRow('class')).toBeUndefined();
		expect(photoRow('class-photo')).toBeUndefined();
		// The cut is now a photo of its own, and Anna's photo no longer remembers the group photo.
		expect(photoRow('cut-ben')).toMatchObject({ framingOf: null, cutFrom: null });
		expect(photoRow('anna-cut')).toMatchObject({ framingOf: null, cutFrom: null });
		expect(orphans()).toEqual([]);
	});
});

describe('deleting a journal entry', () => {
	it('takes the photos in it, and leaves no photo pointing at nothing', async () => {
		expect(await journal.deleteRemovableBy(creator, 'moment-1', null)).not.toBeNull();

		expect(journalRow('moment-1')).toBeUndefined();
		expect(photoRow('moment-photo')).toBeUndefined();
		// Positive control: the gallery photos are not the entry's to take.
		expect(photoRow('anna-gallery')).toBeDefined();
		expect(photoRow('class-photo')).toBeDefined();
		expect(orphans()).toEqual([]);
	});
});

describe('deleting a gallery photo', () => {
	it('takes its framing, and leaves no photo pointing at nothing', async () => {
		expect(await photos.deleteRemovableGalleryPhoto(creator, 'anna-gallery', null)).not.toBeNull();

		expect(photoRow('anna-gallery')).toBeUndefined();
		expect(photoRow('anna-framing')).toBeUndefined();
		// Positive control: the group photo and Anna's photo of her own stay.
		expect(photoRow('class-photo')).toBeDefined();
		expect(photoRow('anna-cut')).toBeDefined();
		expect(orphans()).toEqual([]);
	});
});

describe('the check itself', () => {
	it('finds a photo whose every kind of reference names a row that is not there', () => {
		db.insert(schema.photo)
			.values([
				{
					id: 'dangling-framing',
					householdId: H,
					createdBy: U1,
					framingOf: 'gone-photo',
					filePath: 'd1.jpg',
					thumbPath: 'd1_t.jpg',
					mime: 'image/jpeg'
				},
				{
					id: 'dangling-cut',
					householdId: H,
					createdBy: U1,
					cutFrom: 'gone-photo',
					filePath: 'd2.jpg',
					thumbPath: 'd2_t.jpg',
					mime: 'image/jpeg'
				},
				{
					id: 'dangling-circle',
					householdId: H,
					createdBy: U1,
					circleId: 'gone-circle',
					filePath: 'd3.jpg',
					thumbPath: 'd3_t.jpg',
					mime: 'image/jpeg'
				}
			])
			.run();

		expect(
			orphans()
				.map((row) => row.id)
				.sort()
		).toEqual(['dangling-circle', 'dangling-cut', 'dangling-framing']);
	});
});
