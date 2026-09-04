import { and, eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { contactVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { Contact, ContactRepository, NewContact } from '../domain/contacts/contacts';
import type * as schema from './schema';
import { contact as contactTable } from './schema';

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
					description: contactTable.description,
					visibility: contactTable.visibility,
					avatarPhotoId: contactTable.avatarPhotoId
				})
				.from(contactTable)
				.where(contactVisibleTo(viewer))
				.orderBy(contactTable.displayName)
				.all();
		}
	};
}
