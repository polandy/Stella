import { and, eq, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { contactColumnsVisibleTo, contactVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type {
	Contact,
	ContactRepository,
	NewContact,
	ProfilePatch
} from '../domain/contacts/contacts';
import type { NameCandidate, NameCandidateSource } from '../domain/contacts/suggestions';
import type * as schema from './schema';
import { contact as contactTable, relationship } from './schema';

/*
 * Drizzle adapter for the ContactRepository port (docs/08 §8.3). Reads are scoped through
 * the central `contactVisibleTo` condition so access control is enforced in one place.
 */

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
				.select({
					id: contactTable.id,
					displayName: contactTable.displayName,
					firstName: contactTable.firstName,
					lastName: contactTable.lastName,
					nickname: contactTable.nickname,
					description: contactTable.description,
					visibility: contactTable.visibility,
					avatarPhotoId: contactTable.avatarPhotoId
				})
				.from(contactTable)
				.where(contactVisibleTo(viewer))
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
				.where(contactVisibleTo(viewer))
				.orderBy(contactTable.displayName)
				.all();
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
