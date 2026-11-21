import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
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
import { circle, journalEntry, photo } from './schema';

/*
 * The delete paths must leave no photo row whose `framing_of`, `circle_id`, `cut_from` or
 * `journal_entry_id` names a row that no longer exists (docs/dev/03 §photo): four of the five
 * references carry no foreign key, so only the repositories can keep them true. One graph of
 * photo rows pointing at each other is built, deleted through the app's real paths, and swept
 * with one generic query after each deletion — never a per-row count, which would miss what a
 * new photo shape hangs off.
 */

const H = 'household-1';
const U1 = 'user-1';
const U2 = 'user-2';
// Deleting is an admin's (docs/dev/02 §2.2), and an admin may also remove what they did not create;
// U1 is the author and the circle's creator besides, so one remover exercises every path.
const admin: Remover = { id: U1, householdId: H, isAdmin: true };

let db: BunSQLiteDatabase<typeof schema>;
let contacts: ReturnType<typeof createDrizzleContactRepository>;
let circles: ReturnType<typeof createDrizzleCircleRepository>;
let journal: ReturnType<typeof createDrizzleJournalRepository>;
let photos: ReturnType<typeof createDrizzlePhotoRepository>;

const photoRow = (over: Partial<StoredPhoto>): StoredPhoto => ({
	id: 'p-x',
	householdId: H,
	contactId: 'anna',
	journalEntryId: null,
	createdBy: U1,
	visibility: 'shared',
	filePath: 'p.jpg',
	thumbPath: 'p_t.jpg',
	mime: 'image/jpeg',
	width: 1600,
	height: 1200,
	sizeBytes: 100,
	takenAt: null,
	createdAt: 1000,
	...over
});

const framingRow = (over: Partial<StoredFraming>): StoredFraming => ({
	id: 'p-frame',
	householdId: H,
	contactId: 'anna',
	journalEntryId: null,
	framingOf: 'p-gallery',
	crop: { x: 10, y: 20, size: 300 },
	createdBy: U1,
	visibility: 'shared',
	filePath: 'f.jpg',
	thumbPath: 'f_t.jpg',
	mime: 'image/jpeg',
	width: 1024,
	height: 1024,
	sizeBytes: 50,
	createdAt: 9000,
	...over
});

const circlePhoto = (over: Partial<StoredCirclePhoto>): StoredCirclePhoto => ({
	id: 'p-class',
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

const contactAudit = (): ActivityOf<'contact.deleted'> => ({
	id: 'log-1',
	householdId: H,
	actorId: U1,
	createdAt: 1_700_000_000_000,
	event: {
		kind: 'contact.deleted',
		contactId: 'anna',
		displayName: 'anna',
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

/** The group photo, the cut made from it, and the photo a cut became — the names in the graph. */
const GALLERY = 'p-gallery';
const FRAME = 'p-frame';
const OTHER = 'p-other';
const GROUP = 'p-class';
const CUT = 'p-cut';
const TURNED = 'p-turned';
const JOURNAL_PHOTO = 'p-jphoto';
const ENTRY = 'j-anna';

const photoIds = () =>
	db
		.select({ id: photo.id })
		.from(photo)
		.all()
		.map((row) => row.id)
		.sort();

/*
 * The sweep: every photo row at once, each of its four references left-joined to the table it
 * names, kept when a set reference has nothing behind it. A framing and a cut-from name photo
 * rows, so the table is aliased twice. A photo row may carry at most one of `framing_of` and
 * `cut_from` (a turned cut has `framing_of` null), and a journal photo neither, so the clauses
 * cannot overlap.
 */

/** The photo a framing is of. */
const framed = alias(photo, 'framed');
/** The group photo a turned cut remembers. */
const cutSource = alias(photo, 'cut_source');

function orphans(): string[] {
	return db
		.select({ id: photo.id })
		.from(photo)
		.leftJoin(framed, eq(framed.id, photo.framingOf))
		.leftJoin(cutSource, eq(cutSource.id, photo.cutFrom))
		.leftJoin(circle, eq(circle.id, photo.circleId))
		.leftJoin(journalEntry, eq(journalEntry.id, photo.journalEntryId))
		.where(
			or(
				and(isNotNull(photo.framingOf), isNull(framed.id)),
				and(isNotNull(photo.cutFrom), isNull(cutSource.id)),
				and(isNotNull(photo.circleId), isNull(circle.id)),
				and(isNotNull(photo.journalEntryId), isNull(journalEntry.id))
			)
		)
		.all()
		.map((row) => row.id)
		.sort();
}

/*
 * The graph: two people, a circle with a group photo, a cut of it worn by Ben, a cut of it Anna
 * wore and then turned into a photo of her own (which remembers the group photo), her gallery
 * photo with a framing of it, another gallery photo she wears, and a journal entry of hers with
 * a photo of its own. Every delete path below takes a slice of this and must leave the rest true.
 */
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

	contacts = createDrizzleContactRepository(db);
	circles = createDrizzleCircleRepository(db);
	journal = createDrizzleJournalRepository(db, sequentialIds('j-'));
	photos = createDrizzlePhotoRepository(db);
	const framings = createDrizzleFramingRepository(db);
	const cuts = createDrizzleCutRepository(db);
	const circlePhotos = createDrizzleCirclePhotoRepository(db);

	seedContact('anna');
	seedContact('ben');
	seedCircle('class', ['anna', 'ben']);
	await circlePhotos.insert(circlePhoto({ id: GROUP }));

	// Anna's gallery photo, the framing of it she once wore, and the photo she wears now.
	await photos.insert(photoRow({ id: GALLERY }));
	await framings.replaceFraming(framingRow({ id: FRAME, contactId: 'anna', framingOf: GALLERY }));
	await photos.insert(photoRow({ id: OTHER }));
	// Ben's cut of the group photo; then Anna's, which she turned into a photo of her own when
	// she put on `p-other` — a photo that remembers the group photo it was cut from.
	await cuts.replaceCut(framingRow({ id: CUT, contactId: 'ben', framingOf: GROUP }));
	await cuts.replaceCut(framingRow({ id: TURNED, contactId: 'anna', framingOf: GROUP }));
	await photos.setContactAvatar('anna', OTHER);

	// A journal entry about Anna with a photo of its own.
	db.insert(schema.journalEntry)
		.values({
			id: ENTRY,
			contactId: 'anna',
			subjectKey: 'anna',
			createdBy: U1,
			visibility: 'shared',
			entryDate: '2025-01-01',
			body: 'an entry'
		})
		.run();
	await photos.insert(photoRow({ id: JOURNAL_PHOTO, contactId: 'anna', journalEntryId: ENTRY }));

	// The graph itself must be clean before any delete is exercised.
	expect(orphans()).toEqual([]);
});

describe('deleting a contact', () => {
	it('removes her photos and her entry, and leaves no photo pointing at a gone row', async () => {
		expect(await contacts.deleteDeletableBy(admin, 'anna', contactAudit())).not.toBeNull();

		// Anna's own photos, the framing of one, the turned cut, the journal photo, the entry.
		expect(photoIds()).toEqual([GROUP, CUT]);
		expect(orphans()).toEqual([]);
	});
});

describe('deleting a circle', () => {
	it('removes the group photo, keeps the cuts as photos of their own, and leaves no photo pointing at a gone row', async () => {
		expect(await circles.deleteDeletable(admin, 'class', circleAudit(admin))).not.toBeNull();

		// The group photo goes; Ben's cut and Anna's turned cut stay as photos of their own.
		expect(photoIds()).toEqual([CUT, FRAME, GALLERY, JOURNAL_PHOTO, OTHER, TURNED]);
		expect(orphans()).toEqual([]);
	});
});

describe('deleting a journal entry', () => {
	it('removes its photo and leaves no photo pointing at a gone row', async () => {
		expect(await journal.deleteRemovableBy(admin, ENTRY, null)).not.toBeNull();

		expect(photoIds().includes(JOURNAL_PHOTO)).toBe(false);
		expect(orphans()).toEqual([]);
	});
});

describe('deleting a gallery photo', () => {
	it('removes it with its framing and leaves no photo pointing at a gone row', async () => {
		expect(await photos.deleteRemovableGalleryPhoto(admin, GALLERY, null)).not.toBeNull();

		expect(photoIds().includes(GALLERY)).toBe(false);
		expect(photoIds().includes(FRAME)).toBe(false);
		expect(orphans()).toEqual([]);
	});
});

describe('the sweep itself', () => {
	it('finds a photo that points at a row that is not there', () => {
		// No repository would write this: `framing_of` carries no foreign key, so only the
		// sweep can catch a row that names a photo which is gone.
		db.insert(schema.photo)
			.values({
				id: 'p-dangling',
				householdId: H,
				contactId: 'anna',
				framingOf: 'no-such-photo',
				createdBy: U1,
				visibility: 'shared',
				filePath: 'd.jpg',
				thumbPath: 'd_t.jpg',
				mime: 'image/jpeg'
			})
			.run();

		expect(orphans()).toEqual(['p-dangling']);
	});
});
