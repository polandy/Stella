import { and, eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { contactVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { ContactFieldRepository, NewContactField } from '../domain/contact-fields/contact-fields';
import type * as schema from './schema';
import { contact, contactField } from './schema';

/*
 * Drizzle adapter for the ContactFieldRepository port (docs/08 §8.3). Fields have no
 * visibility of their own; reads join the parent contact and are scoped through the central
 * `contactVisibleTo`, so fields are only returned when their contact is visible.
 */

export function createDrizzleContactFieldRepository(
	db: BunSQLiteDatabase<typeof schema>
): ContactFieldRepository {
	return {
		async insert(f: NewContactField) {
			db.insert(contactField).values(f).run();
		},

		async listForContactVisibleTo(viewer: Viewer, contactId: string) {
			return db
				.select({
					id: contactField.id,
					contactId: contactField.contactId,
					kind: contactField.kind,
					label: contactField.label,
					value: contactField.value,
					meta: contactField.meta,
					sortOrder: contactField.sortOrder,
					createdAt: contactField.createdAt,
					updatedAt: contactField.updatedAt
				})
				.from(contactField)
				.innerJoin(contact, eq(contactField.contactId, contact.id))
				.where(and(eq(contactField.contactId, contactId), contactVisibleTo(viewer)))
				.orderBy(contactField.sortOrder, contactField.createdAt)
				.all();
		},

		async remove(contactId: string, fieldId: string) {
			db.delete(contactField)
				.where(and(eq(contactField.id, fieldId), eq(contactField.contactId, contactId)))
				.run();
		}
	};
}
