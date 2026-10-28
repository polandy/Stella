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
 * such entry is not returned at all, and one only the viewer's own private entries carry is marked.
 */

export function createDrizzleEntryTagReads(db: BunSQLiteDatabase<typeof schema>): EntryTagReads {
	const count = sql<number>`count(*)`;
	const visibleTags = (viewer: Viewer, contactId?: string): KnownTag[] =>
		db
			.select({
				name: entryTag.name,
				key: entryTag.key,
				count,
				// Anyone else sees it once an entry not private to the viewer carries it, anywhere.
				onlyPrivate: sql<number>`not exists (select 1 from journal_entry_tag jt join journal_entry j on j.id = jt.journal_entry_id where jt.entry_tag_id = ${entryTag.id} and (j.visibility = 'shared' or j.created_by != ${viewer.id}))`
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
			.all()
			.map((t) => ({ ...t, onlyPrivate: t.onlyPrivate === 1 }));

	return {
		async listVisibleTo(viewer) {
			return visibleTags(viewer);
		},
		async listOnContactVisibleTo(viewer, contactId) {
			return visibleTags(viewer, contactId);
		}
	};
}
