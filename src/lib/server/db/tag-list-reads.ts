import { and, eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { contactVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { TagListReads } from '../domain/tags/tag-lists';
import { tagColumns, toTag } from './tag-columns';
import { contact, contactTag, tag } from './schema';
import type * as schema from './schema';

/*
 * Drizzle adapter for the tag lists (docs/08 §8.3). Tags are household-global; assignments are
 * read through the central `contactVisibleTo` so tags on a private contact (and that contact)
 * never surface to others.
 */

export function createDrizzleTagListReads(db: BunSQLiteDatabase<typeof schema>): TagListReads {
	return {
		async listByHousehold(householdId: string) {
			return db
				.select(tagColumns)
				.from(tag)
				.where(eq(tag.householdId, householdId))
				.orderBy(tag.name)
				.all()
				.map(toTag);
		},

		async listForContactVisibleTo(viewer: Viewer, contactId: string) {
			return db
				.select(tagColumns)
				.from(contactTag)
				.innerJoin(tag, eq(contactTag.tagId, tag.id))
				.innerJoin(contact, eq(contactTag.contactId, contact.id))
				.where(and(eq(contactTag.contactId, contactId), contactVisibleTo(viewer)))
				.orderBy(tag.name)
				.all()
				.map(toTag);
		},

		async listContactsByTagVisibleTo(viewer: Viewer, tagId: string) {
			return db
				.select({
					id: contact.id,
					displayName: contact.displayName,
					firstName: contact.firstName,
					lastName: contact.lastName,
					nickname: contact.nickname,
					formerName: contact.formerName,
					description: contact.description,
					metPlace: contact.metPlace,
					metDate: contact.metDate,
					visibility: contact.visibility,
					avatarPhotoId: contact.avatarPhotoId,
					birthDate: contact.birthDate,
					jobTitle: contact.jobTitle,
					company: contact.company
				})
				.from(contactTag)
				.innerJoin(contact, eq(contactTag.contactId, contact.id))
				.where(and(eq(contactTag.tagId, tagId), contactVisibleTo(viewer)))
				.orderBy(contact.displayName)
				.all();
		}
	};
}
