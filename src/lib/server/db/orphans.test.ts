import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Remover } from '../access/visibility';
import type { ActivityOf } from '../domain/activity/activity';
import type { StoredCirclePhoto } from '../domain/circles/circle-photos';
import type { StoredPhoto } from '../domain/media/avatars';
import type { StoredFraming } from '../domain/media/framing';
import { sequentialIds } from '../domain/testing';
import { createDrizzleCirclePhotoRepository } from './circle-photo-repository';
import { createDrizzleCircleRepository } from './circle-repository';
import { createDrizzleContactRepository } from './contact-repository';
import { createDrizzleCutRepository } from './cut-repository';
import { createDrizzleFramingRepository } from './framing-repository';
import { createDrizzleJournalRepository } from './journal-repository';
import { createDrizzlePhotoRepository } from './photo-repository';
import * as schema from './schema';

/*
 * The orphans a photo row can leave behind (docs/dev/03 `photo`): `framing_of`, `circle_id` and
 * `cut_from` carry no foreign key at all, and `journal_entry_id` carries one without a cascade,
 * so the repositories clear them by hand. Nothing in the database stops a forgotten cleanup from
 * leaving a photo row — and its bytes — behind; only an export says so, long afterwards.
 *
 * This spec plants the rows that point at each other, deletes each of their owners through the
 * path the app uses, and asks one question after every deletion: is there a photo row left whose
 * `framing_of`, `circle_id`, `cut_from` or `journal_entry_id` names a row that is not there any
 * more? The question is asked of every photo row, never of a hand-picked id: a check that counts
 * the photos pointing at one id passes as soon as that id's table is empty.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
// Deleting a person is an admin's alone (docs/dev/03 §3.7); the rest is the creator's.
const admin: Remover = { id: U1, householdId: H, isAdmin: true };
const creator: Remover = { id: U1, householdId: H, isAdmin: false };

let db: BunSQLiteDatabase<typeof schema>;

const contactAudit: ActivityOf<'contact.deleted'> = {
	id: 'log-1',
	householdId: H,
	actorId: U1,
	createdAt: 1_700_000_000_000,
	event: {
		kind: 'contact.deleted',
		contactId: 'mara',
		displayName: 'Mara',
		visibility: 'shared'
	}
};

const circleAudit: ActivityOf<'circle.deleted'> = {
	id: 'log-2',
	householdId: H,
	actorId: U1,
	createdAt: 1_700_000_000_000,
	event: { kind: 'circle.deleted', circleId: 'class', name: 'Class', visibility: 'shared' }
};

// The four things a photo row points at, each read on its own.
const framed = alias(schema.photo, 'framed');
const cutGroup = alias(schema.photo, 'cut_group');
const ownerCircle = alias(schema.circle, 'owner_circle');
const ownerEntry = alias(schema.journalEntry, 'owner_entry');

/** A photo row, and what it points at. */
interface Orphan {
	id: string;
	framingOf: string | null;
	circleId: string | null;
	cutFrom: string | null;
	journalEntryId: string | null;
}

/**
 * Every photo row whose `framing_of`, `cut_from`, `circle_id` or `journal_entry_id` names a row
 * that is not there any more — one query over all of them, so a row nobody thought of is found
 * as well.
 */
function orphans(): Orphan[] {
	return db
		.select({
			id: schema.photo.id,
			framingOf: schema.photo.framingOf,
			circleId: schema.photo.circleId,
			cutFrom: schema.photo.cutFrom,
			journalEntryId: schema.photo.journalEntryId
		})
		.from(schema.photo)
		.leftJoin(framed, eq(schema.photo.framingOf, framed.id))
		.leftJoin(cutGroup, eq(schema.photo.cutFrom, cutGroup.id))
		.leftJoin(ownerCircle, eq(schema.photo.circleId, ownerCircle.id))
		.leftJoin(ownerEntry, eq(schema.photo.journalEntryId, ownerEntry.id))
		.where(
			or(
				and(isNotNull(schema.photo.framingOf), isNull(framed.id)),
				and(isNotNull(schema.photo.cutFrom), isNull(cutGroup.id)),
				and(isNotNull(schema.photo.circleId), isNull(ownerCircle.id)),
				and(isNotNull(schema.photo.journalEntryId), isNull(ownerEntry.id))
			)
		)
		.all();
}

const photoRow = (id: string) =>
	db.select().from(schema.photo).where(eq(schema.photo.id, id)).get();
/** The ids of the photo rows that are still there — the check is never over an empty table. */
const photoIds = () =>
	db
		.select({ id: schema.photo.id })
		.from(schema.photo)
		.all()
		.map((row) => row.id)
		.sort();
const contactRow = (id: string) =>
	db.select().from(schema.contact).where(eq(schema.contact.id, id)).get();
const circleRow = (id: string) =>
	db.select().from(schema.circle).where(eq(schema.circle.id, id)).get();
const entryRow = (id: string) =>
	db.select().from(schema.journalEntry).where(eq(schema.journalEntry.id, id)).get();

function seedContact(id: string) {
	db.insert(schema.contact)
		.values({ id, householdId: H, createdBy: U1, visibility: 'shared', displayName: id })
		.run();
}

const galleryPhoto = (over: Partial<StoredPhoto> = {}): StoredPhoto => ({
	id: 'g-shared',
	householdId: H,
	contactId: 'mara',
	journalEntryId: null,
	createdBy: U1,
	visibility: 'shared',
	filePath: 'g-shared.jpg',
	thumbPath: 'g-shared_t.jpg',
	mime: 'image/jpeg',
	width: 1024,
	height: 1024,
	sizeBytes: 100,
	takenAt: null,
	createdAt: 1000,
	...over
});

/** A framing: a square of a gallery photo, worn as that person's avatar. */
const framing = (over: Partial<StoredFraming> = {}): StoredFraming => ({
	...galleryPhoto({
		id: 'f-mara',
		filePath: 'f-mara.jpg',
		thumbPath: 'f-mara_t.jpg',
		createdAt: 1100
	}),
	framingOf: 'g-shared',
	crop: { x: 10, y: 20, size: 300 },
	...over
});

/** A cut is a framing of a circle photo, with the person who wears it as its owner. */
const cutOf = (over: Partial<StoredFraming> = {}): StoredFraming => ({
	...framing({
		id: 'cut-anna',
		contactId: 'anna',
		framingOf: 'class-photo',
		filePath: 'cut-anna.jpg',
		thumbPath: 'cut-anna_t.jpg',
		createdAt: 1200
	}),
	...over
});

const groupPhoto = (over: Partial<StoredCirclePhoto> = {}): StoredCirclePhoto => ({
	id: 'class-photo',
	householdId: H,
	circleId: 'class',
	circleRole: null,
	createdBy: U1,
	visibility: 'shared',
	filePath: 'class-photo.jpg',
	thumbPath: 'class-photo_t.jpg',
	viewPath: 'class-photo_v.jpg',
	mime: 'image/jpeg',
	width: 4096,
	height: 2731,
	sizeBytes: 1000,
	takenAt: null,
	createdAt: 900,
	...over
});

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

	// Three people: Mara keeps a gallery, Anna wears a cut of the class photo, Ben keeps an
	// earlier cut as a photo of his own.
	seedContact('mara');
	seedContact('anna');
	seedContact('ben');

	db.insert(schema.circle)
		.values({ id: 'class', householdId: H, createdBy: U1, visibility: 'shared', name: 'Class' })
		.run();
	for (const contactId of ['mara', 'anna', 'ben']) {
		db.insert(schema.circleMembership)
			.values({ id: `class-${contactId}`, circleId: 'class', contactId, createdBy: U1 })
			.run();
	}

	const photos = createDrizzlePhotoRepository(db);
	const circlePhotos = createDrizzleCirclePhotoRepository(db);
	const framings = createDrizzleFramingRepository(db);
	const cuts = createDrizzleCutRepository(db);

	// Mara's gallery photo and the square she wears of it.
	await photos.insert(galleryPhoto());
	await framings.replaceFraming(framing());

	// The class photo, the cut Anna wears of it, and the cut Ben wore before: it became a photo
	// of his own, remembering the group photo it was cut from.
	await circlePhotos.insert(groupPhoto());
	await cuts.replaceCut(cutOf());
	await cuts.replaceCut(
		cutOf({
			id: 'cut-ben',
			contactId: 'ben',
			filePath: 'cut-ben.jpg',
			thumbPath: 'cut-ben_t.jpg',
			createdAt: 1300
		})
	);
	await photos.insert(
		galleryPhoto({
			id: 'ben-photo',
			contactId: 'ben',
			filePath: 'ben.jpg',
			thumbPath: 'ben_t.jpg',
			createdAt: 1400
		})
	);
	await photos.setContactAvatar('ben', 'ben-photo');

	// A moment about Mara, with a photo of its own.
	const journal = createDrizzleJournalRepository(db, sequentialIds('entry-1'));
	await journal.insert({
		id: 'j1',
		contactId: 'mara',
		subjectIds: ['mara'],
		createdBy: U1,
		visibility: 'shared',
		entryDate: '2026-01-01',
		title: null,
		body: 'A day at the lake',
		createdAt: 1500,
		updatedAt: 1500
	});
	await photos.insert(
		galleryPhoto({
			id: 'p-journal',
			journalEntryId: 'j1',
			filePath: 'p-journal.jpg',
			thumbPath: 'p-journal_t.jpg',
			createdAt: 1600
		})
	);
});

/*
 * The rows the spec plants, and what they point at: a framing of a photo, a circle with its
 * group photo, a cut of that group photo, a photo cut from it, and a moment with a photo.
 */
describe('the rows that point at each other', () => {
	it('are planted the way the app makes them', () => {
		expect(photoRow('f-mara')).toMatchObject({ framingOf: 'g-shared', contactId: 'mara' });
		expect(photoRow('class-photo')).toMatchObject({ circleId: 'class', contactId: null });
		expect(photoRow('cut-anna')).toMatchObject({ framingOf: 'class-photo', contactId: 'anna' });
		expect(photoRow('cut-ben')).toMatchObject({
			framingOf: null,
			cutFrom: 'class-photo',
			contactId: 'ben'
		});
		expect(photoRow('p-journal')).toMatchObject({ journalEntryId: 'j1' });
		// Nothing dangles to begin with.
		expect(orphans()).toEqual([]);
	});
});

describe('deleting a person', () => {
	it('leaves no photo row pointing at a row that is gone', async () => {
		const contacts = createDrizzleContactRepository(db);

		expect(await contacts.deleteDeletableBy(admin, 'mara', contactAudit)).not.toBeNull();
		// The person is gone, and so are their photos.
		expect(contactRow('mara')).toBeUndefined();
		expect(photoRow('g-shared')).toBeUndefined();
		expect(photoRow('f-mara')).toBeUndefined();
		expect(photoRow('p-journal')).toBeUndefined();
		expect(entryRow('j1')).toBeUndefined();
		// The others keep theirs, so the check below is over a table with rows in it.
		expect(photoIds()).toEqual(['ben-photo', 'class-photo', 'cut-anna', 'cut-ben']);

		expect(orphans()).toEqual([]);
	});
});

describe('deleting a circle', () => {
	it('leaves no photo row pointing at a row that is gone', async () => {
		const circles = createDrizzleCircleRepository(db);

		expect(await circles.deleteDeletable(creator, 'class', circleAudit)).not.toBeNull();
		// The circle and its group photo are gone; the cuts became their wearers' own photos.
		expect(circleRow('class')).toBeUndefined();
		expect(photoRow('class-photo')).toBeUndefined();
		expect(photoRow('cut-anna')).toMatchObject({ framingOf: null, cutFrom: null });
		expect(photoRow('cut-ben')).toMatchObject({ framingOf: null, cutFrom: null });
		expect(photoIds()).toEqual([
			'ben-photo',
			'cut-anna',
			'cut-ben',
			'f-mara',
			'g-shared',
			'p-journal'
		]);

		expect(orphans()).toEqual([]);
	});
});

describe('deleting a moment', () => {
	it('leaves no photo row pointing at a row that is gone', async () => {
		const journal = createDrizzleJournalRepository(db, sequentialIds('entry-2'));

		expect(await journal.deleteRemovableBy(creator, 'j1', null)).not.toBeNull();
		expect(entryRow('j1')).toBeUndefined();
		expect(photoRow('p-journal')).toBeUndefined();
		// The gallery of that person is untouched.
		expect(photoRow('g-shared')).toBeDefined();
		expect(photoIds()).toEqual([
			'ben-photo',
			'class-photo',
			'cut-anna',
			'cut-ben',
			'f-mara',
			'g-shared'
		]);

		expect(orphans()).toEqual([]);
	});
});

describe('deleting a gallery photo', () => {
	it('leaves no photo row pointing at a row that is gone', async () => {
		const photos = createDrizzlePhotoRepository(db);

		expect(await photos.deleteRemovableGalleryPhoto(creator, 'g-shared', null)).not.toBeNull();
		expect(photoRow('g-shared')).toBeUndefined();
		// The framing of the photo went with it.
		expect(photoRow('f-mara')).toBeUndefined();
		expect(photoIds()).toEqual(['ben-photo', 'class-photo', 'cut-anna', 'cut-ben', 'p-journal']);

		expect(orphans()).toEqual([]);
	});
});

/*
 * The check itself: a photo row that points at nothing must be found, or the four cases above
 * would pass against a check that never looks.
 */
describe('the check', () => {
	it('finds a photo row that points at a row that is not there', () => {
		db.insert(schema.photo)
			.values([
				{
					id: 'dangling-framing',
					householdId: H,
					contactId: 'mara',
					framingOf: 'no-such-photo',
					createdBy: U1,
					filePath: 'dangling-framing.jpg',
					thumbPath: 'dangling-framing_t.jpg',
					mime: 'image/jpeg'
				},
				{
					id: 'dangling-cut',
					householdId: H,
					contactId: 'mara',
					cutFrom: 'no-such-photo',
					createdBy: U1,
					filePath: 'dangling-cut.jpg',
					thumbPath: 'dangling-cut_t.jpg',
					mime: 'image/jpeg'
				},
				{
					id: 'dangling-circle',
					householdId: H,
					circleId: 'no-such-circle',
					createdBy: U1,
					filePath: 'dangling-circle.jpg',
					thumbPath: 'dangling-circle_t.jpg',
					mime: 'image/jpeg'
				}
			])
			.run();

		expect(orphans()).toEqual([
			{
				id: 'dangling-framing',
				framingOf: 'no-such-photo',
				circleId: null,
				cutFrom: null,
				journalEntryId: null
			},
			{
				id: 'dangling-cut',
				framingOf: null,
				circleId: null,
				cutFrom: 'no-such-photo',
				journalEntryId: null
			},
			{
				id: 'dangling-circle',
				framingOf: null,
				circleId: 'no-such-circle',
				cutFrom: null,
				journalEntryId: null
			}
		]);
	});

	it('finds nothing in a database whose rows all point at rows that are there', () => {
		expect(orphans()).toEqual([]);
	});
});
