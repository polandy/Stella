import { beforeEach, describe, expect, it } from 'bun:test';
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

/*
 * Integration spec for the references between photos and the rows they name. Some of those
 * references have no foreign key, so every application delete path has to leave the photo table
 * internally consistent on its own (docs/dev/03 `photo`).
 */

const H = 'household-1';
const U1 = 'user-1';
const CONTACT = 'gallery-person';
const CUT_WEARER = 'cut-wearer';
const FORMER_CUT_WEARER = 'former-cut-wearer';
const CIRCLE = 'class';
const GALLERY_PHOTO = 'gallery-photo';
const FRAMING = 'gallery-framing';
const GROUP_PHOTO = 'class-photo';
const CUT = 'class-cut';
const FORMER_CUT = 'former-class-cut';
const JOURNAL_ENTRY = 'journal-entry';
const JOURNAL_PHOTO = 'journal-photo';

const admin: Remover = { id: U1, householdId: H, isAdmin: true };
const creator: Remover = { id: U1, householdId: H, isAdmin: false };

let db: BunSQLiteDatabase<typeof schema>;

const framedPhoto = alias(schema.photo, 'framed_photo');
const cutPhoto = alias(schema.photo, 'cut_photo');
const parentCircle = alias(schema.circle, 'parent_circle');
const parentJournal = alias(schema.journalEntry, 'parent_journal');

/** Every photo whose named parent is missing, whatever kind of parent it names. */
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
		.leftJoin(framedPhoto, eq(schema.photo.framingOf, framedPhoto.id))
		.leftJoin(cutPhoto, eq(schema.photo.cutFrom, cutPhoto.id))
		.leftJoin(parentCircle, eq(schema.photo.circleId, parentCircle.id))
		.leftJoin(parentJournal, eq(schema.photo.journalEntryId, parentJournal.id))
		.where(
			or(
				and(isNotNull(schema.photo.framingOf), isNull(framedPhoto.id)),
				and(isNotNull(schema.photo.cutFrom), isNull(cutPhoto.id)),
				and(isNotNull(schema.photo.circleId), isNull(parentCircle.id)),
				and(isNotNull(schema.photo.journalEntryId), isNull(parentJournal.id))
			)
		)
		.all();
}

function seedPhoto(over: Partial<typeof schema.photo.$inferInsert> = {}) {
	db.insert(schema.photo)
		.values({
			id: 'photo',
			householdId: H,
			contactId: null,
			journalEntryId: null,
			framingOf: null,
			circleId: null,
			cutFrom: null,
			createdBy: U1,
			visibility: 'shared',
			filePath: 'photo.jpg',
			thumbPath: 'photo-thumb.jpg',
			mime: 'image/jpeg',
			...over
		})
		.run();
}

function seedFixture() {
	db.insert(schema.contact)
		.values([
			{ id: CONTACT, householdId: H, createdBy: U1, visibility: 'shared', displayName: CONTACT },
			{
				id: CUT_WEARER,
				householdId: H,
				createdBy: U1,
				visibility: 'shared',
				displayName: CUT_WEARER
			},
			{
				id: FORMER_CUT_WEARER,
				householdId: H,
				createdBy: U1,
				visibility: 'shared',
				displayName: FORMER_CUT_WEARER
			}
		])
		.run();
	db.insert(schema.circle)
		.values({ id: CIRCLE, householdId: H, createdBy: U1, visibility: 'shared', name: CIRCLE })
		.run();
	db.insert(schema.circleMembership)
		.values([
			{ id: `${CIRCLE}-${CONTACT}`, circleId: CIRCLE, contactId: CONTACT, createdBy: U1 },
			{ id: `${CIRCLE}-${CUT_WEARER}`, circleId: CIRCLE, contactId: CUT_WEARER, createdBy: U1 },
			{
				id: `${CIRCLE}-${FORMER_CUT_WEARER}`,
				circleId: CIRCLE,
				contactId: FORMER_CUT_WEARER,
				createdBy: U1
			}
		])
		.run();
	db.insert(schema.journalEntry)
		.values({
			id: JOURNAL_ENTRY,
			contactId: CONTACT,
			subjectKey: CONTACT,
			createdBy: U1,
			visibility: 'shared',
			entryDate: '2026-01-01',
			body: 'A moment'
		})
		.run();

	seedPhoto({ id: GALLERY_PHOTO, contactId: CONTACT });
	seedPhoto({ id: FRAMING, contactId: CONTACT, framingOf: GALLERY_PHOTO });
	seedPhoto({ id: GROUP_PHOTO, circleId: CIRCLE });
	seedPhoto({ id: CUT, contactId: CUT_WEARER, framingOf: GROUP_PHOTO });
	seedPhoto({ id: FORMER_CUT, contactId: FORMER_CUT_WEARER, cutFrom: GROUP_PHOTO });
	seedPhoto({ id: JOURNAL_PHOTO, contactId: CONTACT, journalEntryId: JOURNAL_ENTRY });
}

function contactAudit(): ActivityOf<'contact.deleted'> {
	return {
		id: 'contact-deletion-log',
		householdId: H,
		actorId: U1,
		createdAt: 1_700_000_000_000,
		event: {
			kind: 'contact.deleted',
			contactId: CONTACT,
			displayName: CONTACT,
			visibility: 'shared'
		}
	};
}

function circleAudit(): ActivityOf<'circle.deleted'> {
	return {
		id: 'circle-deletion-log',
		householdId: H,
		actorId: U1,
		createdAt: 1_700_000_000_000,
		event: {
			kind: 'circle.deleted',
			circleId: CIRCLE,
			name: CIRCLE,
			visibility: 'shared'
		}
	};
}

beforeEach(() => {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	db.insert(schema.household).values({ id: H, name: 'H' }).run();
	db.insert(schema.user).values({ id: U1, householdId: H, email: 'u1@x.test', name: 'One' }).run();
	seedFixture();
});

describe('photo references after application deletes', () => {
	it('leaves no dangling photo after deleting a contact', async () => {
		const removed = await createDrizzleContactRepository(db).deleteDeletableBy(
			admin,
			CONTACT,
			contactAudit()
		);

		expect(removed).not.toBeNull();
		expect(
			db
				.select({ id: schema.contact.id })
				.from(schema.contact)
				.where(eq(schema.contact.id, CONTACT))
				.get()
		).toBeUndefined();
		expect(orphanPhotos()).toEqual([]);
	});

	it('leaves no dangling photo after deleting a circle', async () => {
		const removed = await createDrizzleCircleRepository(db).deleteDeletable(
			creator,
			CIRCLE,
			circleAudit()
		);

		expect(removed).not.toBeNull();
		expect(
			db
				.select({ id: schema.circle.id })
				.from(schema.circle)
				.where(eq(schema.circle.id, CIRCLE))
				.get()
		).toBeUndefined();
		expect(orphanPhotos()).toEqual([]);
	});

	it('leaves no dangling photo after deleting a journal entry', async () => {
		const removed = await createDrizzleJournalRepository(
			db,
			sequentialIds('journal-id')
		).deleteRemovableBy(creator, JOURNAL_ENTRY, null);

		expect(removed).not.toBeNull();
		expect(
			db
				.select({ id: schema.journalEntry.id })
				.from(schema.journalEntry)
				.where(eq(schema.journalEntry.id, JOURNAL_ENTRY))
				.get()
		).toBeUndefined();
		expect(orphanPhotos()).toEqual([]);
	});

	it('leaves no dangling photo after deleting a gallery photo', async () => {
		const removed = await createDrizzlePhotoRepository(db).deleteRemovableGalleryPhoto(
			creator,
			GALLERY_PHOTO,
			null
		);

		expect(removed).not.toBeNull();
		expect(
			db
				.select({ id: schema.photo.id })
				.from(schema.photo)
				.where(eq(schema.photo.id, GALLERY_PHOTO))
				.get()
		).toBeUndefined();
		expect(orphanPhotos()).toEqual([]);
	});

	it('finds a dangling photo reference when one is planted', () => {
		seedPhoto({ id: 'dangling-photo', contactId: CONTACT, framingOf: 'missing-photo' });

		expect(orphanPhotos()).toEqual([
			{
				id: 'dangling-photo',
				framingOf: 'missing-photo',
				cutFrom: null,
				circleId: null,
				journalEntryId: null
			}
		]);
	});
});
