import { and, eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { contactVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { NewActivityEntry } from '../domain/activity/activity';
import type { ImmichLink, ImmichLinkRepository } from '../domain/immich/links';
import type * as schema from './schema';
import { activityLog, contact, immichLink } from './schema';

/*
 * Drizzle adapter for the ImmichLinkRepository port (docs/08 §8.3). A link has no visibility of
 * its own: reads join the contact and are scoped through the central `contactVisibleTo`, like
 * any record hanging off a contact (docs/concepts/immich.md §5). Writes come after the use-case
 * has checked the contact, and carry their activity-log line in the same transaction.
 */
export function createDrizzleImmichLinkRepository(
	db: BunSQLiteDatabase<typeof schema>
): ImmichLinkRepository {
	return {
		async findForContactVisibleTo(viewer: Viewer, contactId: string): Promise<ImmichLink | null> {
			const row = db
				.select({
					contactId: immichLink.contactId,
					immichPersonId: immichLink.immichPersonId,
					linkedBy: immichLink.linkedBy,
					linkedAt: immichLink.linkedAt
				})
				.from(immichLink)
				.innerJoin(contact, eq(immichLink.contactId, contact.id))
				.where(and(eq(immichLink.contactId, contactId), contactVisibleTo(viewer)))
				.get();
			return row ?? null;
		},

		async save(link: ImmichLink, audit: NewActivityEntry): Promise<void> {
			db.transaction((tx) => {
				tx.insert(immichLink)
					.values(link)
					.onConflictDoUpdate({
						target: immichLink.contactId,
						set: { immichPersonId: link.immichPersonId, linkedBy: link.linkedBy, linkedAt: link.linkedAt }
					})
					.run();
				tx.insert(activityLog).values(audit).run();
			});
		},

		async remove(contactId: string, audit: NewActivityEntry): Promise<boolean> {
			return db.transaction((tx) => {
				const removed = tx
					.delete(immichLink)
					.where(eq(immichLink.contactId, contactId))
					.returning({ contactId: immichLink.contactId })
					.all();
				if (removed.length === 0) return false;
				tx.insert(activityLog).values(audit).run();
				return true;
			});
		}
	};
}
