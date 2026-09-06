import { and, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import {
	contactBrowsableBy,
	contactColumnsVisibleTo,
	contactVisibleTo
} from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type {
	Contact,
	ContactRepository,
	NewContact,
	ProfilePatch
} from '../domain/contacts/contacts';
import type { NewActivityEntry } from '../domain/activity/activity';
import type { NameCandidate, NameCandidateSource } from '../domain/contacts/suggestions';
import type * as schema from './schema';
import { activityLog, contact as contactTable, journalEntry, photo, relationship } from './schema';

/*
 * Drizzle adapter for the ContactRepository port (docs/08 §8.3). Reads are scoped through
 * the central `contactVisibleTo` condition so access control is enforced in one place.
 */

/** What a list row shows; shared so the directory and the archive cannot drift apart. */
const summaryColumns = {
	id: contactTable.id,
	displayName: contactTable.displayName,
	firstName: contactTable.firstName,
	lastName: contactTable.lastName,
	nickname: contactTable.nickname,
	description: contactTable.description,
	visibility: contactTable.visibility,
	avatarPhotoId: contactTable.avatarPhotoId
};

const contactColumns = {
	id: contactTable.id,
	householdId: contactTable.householdId,
	createdBy: contactTable.createdBy,
	visibility: contactTable.visibility,
	displayName: contactTable.displayName,
	avatarPhotoId: contactTable.avatarPhotoId,
	firstName: contactTable.firstName,
	lastName: contactTable.lastName,
	nickname: contactTable.nickname,
	description: contactTable.description,
	howWeMet: contactTable.howWeMet,
	metDate: contactTable.metDate,
	metPlace: contactTable.metPlace,
	birthDate: contactTable.birthDate,
	birthDatePrecision: contactTable.birthDatePrecision,
	isDeceased: contactTable.isDeceased,
	archivedAt: contactTable.archivedAt,
	createdAt: contactTable.createdAt,
	updatedAt: contactTable.updatedAt
};

export function createDrizzleContactRepository(
	db: BunSQLiteDatabase<typeof schema>
): ContactRepository & NameCandidateSource {
	return {
		async insert(contact: NewContact) {
			db.insert(contactTable).values(contact).run();
		},

		async findByIdVisibleTo(viewer: Viewer, id: string): Promise<Contact | null> {
			const row = db
				.select(contactColumns)
				.from(contactTable)
				.where(and(eq(contactTable.id, id), contactVisibleTo(viewer)))
				.get();
			// SQLite has no boolean; the domain works with one.
			return row ? { ...row, isDeceased: row.isDeceased === 1 } : null;
		},

		async listVisibleTo(viewer: Viewer) {
			return db
				.select(summaryColumns)
				.from(contactTable)
				.where(contactBrowsableBy(viewer))
				.orderBy(contactTable.displayName)
				.all();
		},

		async listNameCandidatesVisibleTo(viewer: Viewer): Promise<NameCandidate[]> {
			// Count only relationships whose other end the viewer may see, so a private
			// person never shows up as "well connected" through someone else's link.
			const other = alias(contactTable, 'other');
			const visibleLinks = db
				.select({ n: sql<number>`count(*)` })
				.from(relationship)
				.innerJoin(
					other,
					eq(
						other.id,
						sql`case when ${relationship.fromContactId} = ${contactTable.id} then ${relationship.toContactId} else ${relationship.fromContactId} end`
					)
				)
				.where(
					and(
						or(eq(relationship.fromContactId, contactTable.id), eq(relationship.toContactId, contactTable.id)),
						contactColumnsVisibleTo(viewer, other)
					)
				);
			return db
				.select({
					id: contactTable.id,
					displayName: contactTable.displayName,
					firstName: contactTable.firstName,
					lastName: contactTable.lastName,
					relationshipCount: sql<number>`(${visibleLinks})`.mapWith(Number)
				})
				.from(contactTable)
				.where(contactBrowsableBy(viewer))
				.orderBy(contactTable.displayName)
				.all();
		},

		async listArchivedVisibleTo(viewer: Viewer) {
			return db
				.select(summaryColumns)
				.from(contactTable)
				.where(and(contactVisibleTo(viewer), isNotNull(contactTable.archivedAt)))
				.orderBy(contactTable.displayName)
				.all();
		},

		async listNamesVisibleTo(viewer: Viewer) {
			// `contactVisibleTo`, not `contactBrowsableBy`: a mention of an archived person still
			// has to render their name (docs/02 §2.2).
			return db
				.select({ id: contactTable.id, displayName: contactTable.displayName })
				.from(contactTable)
				.where(contactVisibleTo(viewer))
				.all();
		},

		async deleteVisibleTo(viewer: Viewer, id: string, audit: NewActivityEntry) {
			return db.transaction((tx) => {
				const found = tx
					.select({ id: contactTable.id })
					.from(contactTable)
					.where(and(eq(contactTable.id, id), contactVisibleTo(viewer)))
					.get();
				if (!found) return null;

				// Every photo the contact carries — their own and those inside their journal
				// entries — goes first and explicitly. The entries cascade with the contact, but
				// `photo.journal_entry_id` carries no cascade in the database (docs/03 §photo),
				// so the delete below would be refused; and their bytes have to be unlinked.
				const journalPhotoIds = tx
					.select({ id: photo.id })
					.from(photo)
					.innerJoin(journalEntry, eq(photo.journalEntryId, journalEntry.id))
					.where(eq(journalEntry.contactId, id))
					.all()
					.map((row) => row.id);
				const files = tx
					.delete(photo)
					.where(
						or(
							eq(photo.contactId, id),
							journalPhotoIds.length > 0 ? inArray(photo.id, journalPhotoIds) : undefined
						)
					)
					.returning({ filePath: photo.filePath, thumbPath: photo.thumbPath })
					.all();

				tx.delete(contactTable).where(eq(contactTable.id, id)).run();
				// Same transaction as the delete: a removal with no trace is the thing the log
				// exists to prevent (docs/04 §4.9).
				tx.insert(activityLog).values(audit).run();
				return files;
			});
		},

		async setArchived(id: string, archivedAt: number | null) {
			db.update(contactTable).set({ archivedAt }).where(eq(contactTable.id, id)).run();
		},

		async updateProfile(id: string, patch: ProfilePatch) {
			db.update(contactTable)
				.set({
					displayName: patch.displayName,
					description: patch.description,
					updatedAt: patch.updatedAt
				})
				.where(eq(contactTable.id, id))
				.run();
		}
	};
}
