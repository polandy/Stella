import { and, eq, notInArray, sql } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { contactVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { NewTag, Tag, TagColor, TagRepository } from '../domain/tags/tags';
import { contact, contactTag, tag } from './schema';
import type * as schema from './schema';

/*
 * Drizzle adapter for the TagRepository port (docs/08 §8.3). Tags are household-global;
 * assignments are read through the central `contactVisibleTo` so tags on a private contact
 * (and that contact) never surface to others.
 */

const toTag = (row: { id: string; householdId: string; name: string; color: string }): Tag => ({
	id: row.id,
	householdId: row.householdId,
	name: row.name,
	color: row.color as TagColor
});

const tagColumns = {
	id: tag.id,
	householdId: tag.householdId,
	name: tag.name,
	color: tag.color
};

export function createDrizzleTagRepository(db: BunSQLiteDatabase<typeof schema>): TagRepository {
	return {
		async findByName(householdId: string, name: string) {
			const row = db
				.select(tagColumns)
				.from(tag)
				.where(and(eq(tag.householdId, householdId), sql`lower(${tag.name}) = ${name.toLowerCase()}`))
				.get();
			return row ? toTag(row) : null;
		},

		async insert(t: NewTag) {
			db.insert(tag).values(t).run();
		},

		async listByHousehold(householdId: string) {
			return db
				.select(tagColumns)
				.from(tag)
				.where(eq(tag.householdId, householdId))
				.orderBy(tag.name)
				.all()
				.map(toTag);
		},

		async assign(contactId: string, tagId: string) {
			db.insert(contactTag).values({ contactId, tagId }).onConflictDoNothing().run();
		},

		async unassign(contactId: string, tagId: string) {
			db.delete(contactTag)
				.where(and(eq(contactTag.contactId, contactId), eq(contactTag.tagId, tagId)))
				.run();
		},

		async countAssignments(tagId: string) {
			const row = db
				.select({ count: sql<number>`count(*)` })
				.from(contactTag)
				.where(eq(contactTag.tagId, tagId))
				.get();
			return row?.count ?? 0;
		},

		async deleteTag(householdId: string, tagId: string) {
			db.delete(tag)
				.where(and(eq(tag.householdId, householdId), eq(tag.id, tagId)))
				.run();
		},

		async deleteOrphans(householdId: string) {
			const carried = db.select({ id: contactTag.tagId }).from(contactTag);
			const gone = db
				.delete(tag)
				.where(and(eq(tag.householdId, householdId), notInArray(tag.id, carried)))
				.returning({ id: tag.id })
				.all();
			return gone.length;
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
					description: contact.description,
					visibility: contact.visibility,
					avatarPhotoId: contact.avatarPhotoId,
					birthDate: contact.birthDate
				})
				.from(contactTag)
				.innerJoin(contact, eq(contactTag.contactId, contact.id))
				.where(and(eq(contactTag.tagId, tagId), contactVisibleTo(viewer)))
				.orderBy(contact.displayName)
				.all();
		}
	};
}
