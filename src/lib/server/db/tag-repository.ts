import { and, eq, notInArray, sql } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { NewTag, TagRepository } from '../domain/tags/tags';
import { tagColumns, toTag } from './tag-columns';
import { contactTag, tag } from './schema';
import type * as schema from './schema';

/*
 * Drizzle adapter for the TagRepository port (docs/08 §8.3): a tag's writes and the lookups they
 * rest on. Tags are household-global, and so is the count behind deleting one nobody carries.
 * The lists are a read model of their own (`tag-list-reads.ts`).
 */

export function createDrizzleTagRepository(db: BunSQLiteDatabase<typeof schema>): TagRepository {
	return {
		async findByName(householdId: string, name: string) {
			const row = db
				.select(tagColumns)
				.from(tag)
				.where(
					and(eq(tag.householdId, householdId), sql`lower(${tag.name}) = ${name.toLowerCase()}`)
				)
				.get();
			return row ? toTag(row) : null;
		},

		async insert(t: NewTag) {
			db.insert(tag).values(t).run();
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
		}
	};
}
