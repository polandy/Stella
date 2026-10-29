import { and, desc, eq, sql } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { KnownTag } from '../../hashtags/picker';
import { childRecordVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { EntryTagReads } from '../domain/journal/tags';
import type * as schema from './schema';
import { contact, entryTag, journalEntry, journalEntryTag } from './schema';

/*
 * Drizzle adapter for the EntryTagReads port (docs/08 §8.3). A tag is counted over the entries
 * carrying it that the viewer may read — the central `childRecordVisibleTo` — so a tag on no
 * such entry is not returned at all. The private mark is read from those same entries, anywhere
 * in the household: an entry the viewer cannot read never changes it, or it would tell them that
 * someone else's private entry carries the tag.
 */

export function createDrizzleEntryTagReads(db: BunSQLiteDatabase<typeof schema>): EntryTagReads {
	const count = sql<number>`count(*)`;
	const visibleTags = (viewer: Viewer, contactId?: string) =>
		db
			.select({
				name: entryTag.name,
				key: entryTag.key,
				count,
				shared: sql<number>`max(${journalEntry.visibility} = 'shared')`
			})
			.from(entryTag)
			.innerJoin(journalEntryTag, eq(journalEntryTag.entryTagId, entryTag.id))
			.innerJoin(journalEntry, eq(journalEntry.id, journalEntryTag.journalEntryId))
			.innerJoin(contact, eq(contact.id, journalEntry.contactId))
			.where(
				and(
					eq(entryTag.householdId, viewer.householdId),
					contactId ? eq(journalEntry.contactId, contactId) : undefined,
					childRecordVisibleTo(viewer, {
						visibility: journalEntry.visibility,
						createdBy: journalEntry.createdBy
					})
				)
			)
			.groupBy(entryTag.id)
			.orderBy(desc(count), entryTag.key)
			.all();

	const household = (viewer: Viewer): KnownTag[] =>
		visibleTags(viewer).map(({ shared, ...t }) => ({ ...t, onlyPrivate: shared === 0 }));

	return {
		async listVisibleTo(viewer) {
			return household(viewer);
		},
		async listOnContactVisibleTo(viewer, contactId) {
			const sharedSomewhere = new Set(
				household(viewer)
					.filter((t) => !t.onlyPrivate)
					.map((t) => t.key)
			);
			return visibleTags(viewer, contactId).map(({ name, key, count }) => ({
				name,
				key,
				count,
				onlyPrivate: !sharedSomewhere.has(key)
			}));
		}
	};
}
