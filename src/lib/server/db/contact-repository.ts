import { and, eq, inArray, or } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { contactVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type {
	Contact,
	ContactRepository,
	NewContact,
	ProfilePatch
} from '../domain/contacts/contacts';
import type { NewActivityEntry } from '../domain/activity/activity';
import type { MergeableProfile } from '../domain/contacts/merge-profile';
import { mergeContacts } from './contact-merge';
import type { NameWrite } from '../domain/contacts/name-parts';
import { readGender, type Gender } from '../../people/gender';
import type { Job } from '../../people/job';
import type * as schema from './schema';
import {
	activityLog,
	contact as contactTable,
	journalEntry,
	photo,
	user as userTable
} from './schema';

/*
 * Drizzle adapter for the ContactRepository port (docs/08 §8.3): the record's writes and the
 * one-record reads they rest on. Reads are scoped through the central `contactVisibleTo`
 * condition so access control is enforced in one place. The lists are read models of their
 * own (`contact-directory-reads.ts`, `contact-name-reads.ts`, `name-candidate-reads.ts`).
 */

/** The profile columns a merge combines (docs/02 §2.2) — every one that can be empty. */
const mergeableColumns = {
	firstName: contactTable.firstName,
	lastName: contactTable.lastName,
	nickname: contactTable.nickname,
	prefix: contactTable.prefix,
	suffix: contactTable.suffix,
	formerName: contactTable.formerName,
	gender: contactTable.gender,
	pronouns: contactTable.pronouns,
	description: contactTable.description,
	avatarPhotoId: contactTable.avatarPhotoId,
	birthDate: contactTable.birthDate,
	birthDatePrecision: contactTable.birthDatePrecision,
	isDeceased: contactTable.isDeceased,
	deathDate: contactTable.deathDate,
	jobTitle: contactTable.jobTitle,
	company: contactTable.company,
	howWeMet: contactTable.howWeMet,
	metDate: contactTable.metDate,
	metPlace: contactTable.metPlace
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
	formerName: contactTable.formerName,
	description: contactTable.description,
	howWeMet: contactTable.howWeMet,
	metDate: contactTable.metDate,
	metPlace: contactTable.metPlace,
	birthDate: contactTable.birthDate,
	birthDatePrecision: contactTable.birthDatePrecision,
	gender: contactTable.gender,
	jobTitle: contactTable.jobTitle,
	company: contactTable.company,
	isDeceased: contactTable.isDeceased,
	archivedAt: contactTable.archivedAt,
	createdAt: contactTable.createdAt,
	updatedAt: contactTable.updatedAt
};

export function createDrizzleContactRepository(
	db: BunSQLiteDatabase<typeof schema>
): ContactRepository {
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
			// SQLite has no boolean, and the column predates the three genders; the domain
			// works with a boolean and with one of the three or nothing.
			return row
				? { ...row, isDeceased: row.isDeceased === 1, gender: readGender(row.gender) }
				: null;
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

				// `user.self_contact_id` carries no cascade (docs/03 §user), so a member who said
				// they are this person has to be let go of explicitly.
				tx.update(userTable)
					.set({ selfContactId: null })
					.where(eq(userTable.selfContactId, id))
					.run();

				tx.delete(contactTable).where(eq(contactTable.id, id)).run();
				// Same transaction as the delete: a removal with no trace is the thing the log
				// exists to prevent (docs/04 §4.9).
				tx.insert(activityLog).values(audit).run();
				return files;
			});
		},

		async readForMerge(viewer: Viewer, keepId: string, mergedId: string) {
			const rows = db
				.select({
					...mergeableColumns,
					id: contactTable.id,
					displayName: contactTable.displayName,
					visibility: contactTable.visibility
				})
				.from(contactTable)
				.where(and(inArray(contactTable.id, [keepId, mergedId]), contactVisibleTo(viewer)))
				.all();
			const keep = rows.find((row) => row.id === keepId);
			const mergedAway = rows.find((row) => row.id === mergedId);
			if (!keep || !mergedAway) return null;

			const profileOf = (row: (typeof rows)[number]): MergeableProfile => ({
				firstName: row.firstName,
				lastName: row.lastName,
				nickname: row.nickname,
				prefix: row.prefix,
				suffix: row.suffix,
				formerName: row.formerName,
				gender: row.gender,
				pronouns: row.pronouns,
				description: row.description,
				avatarPhotoId: row.avatarPhotoId,
				birthDate: row.birthDate,
				birthDatePrecision: row.birthDatePrecision,
				// SQLite has no boolean; the domain works with one.
				isDeceased: row.isDeceased === 1,
				deathDate: row.deathDate,
				jobTitle: row.jobTitle,
				company: row.company,
				howWeMet: row.howWeMet,
				metDate: row.metDate,
				metPlace: row.metPlace
			});

			return {
				keep: {
					displayName: keep.displayName,
					visibility: keep.visibility,
					profile: profileOf(keep)
				},
				mergedAway: { displayName: mergedAway.displayName, profile: profileOf(mergedAway) }
			};
		},

		async mergeVisibleTo(
			viewer: Viewer,
			keepId: string,
			mergedId: string,
			profile: MergeableProfile,
			audit: NewActivityEntry,
			updatedAt: number
		) {
			return mergeContacts(db, viewer, { keepId, mergedId, profile, audit, updatedAt });
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
		},

		async setGender(id: string, gender: Gender | null, updatedAt: number) {
			db.update(contactTable).set({ gender, updatedAt }).where(eq(contactTable.id, id)).run();
		},

		async setJob(id: string, job: Job, updatedAt: number) {
			db.update(contactTable)
				.set({ ...job, updatedAt })
				.where(eq(contactTable.id, id))
				.run();
		},

		async writeNames(writes: readonly NameWrite[], audit: NewActivityEntry | null) {
			// One transaction: a batch of last names lands whole, with the line that tells the
			// household about it, or not at all (docs/02 §2.2.4.4).
			db.transaction((tx) => {
				for (const { id, ...name } of writes) {
					tx.update(contactTable).set(name).where(eq(contactTable.id, id)).run();
				}
				if (audit) tx.insert(activityLog).values(audit).run();
			});
		}
	};
}
