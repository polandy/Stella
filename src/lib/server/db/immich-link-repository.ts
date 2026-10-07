import { and, eq, inArray } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { contactVisibleTo } from '../access/query-scoping';
import { canViewContact, type Viewer } from '../access/visibility';
import type { NewActivityEntry } from '../domain/activity/activity';
import type { ImmichHolder, ImmichLink, ImmichLinkRepository } from '../domain/immich/links';
import type * as schema from './schema';
import { activityLog, contact, immichLink } from './schema';

/*
 * Drizzle adapter for the ImmichLinkRepository port (docs/08 §8.3). A link has no visibility of
 * its own: reads join the contact and are scoped through the central `contactVisibleTo`, like
 * any record hanging off a contact (docs/02 §2.24.2). Writes come after the use-case
 * has checked the contact, and carry their activity-log line in the same transaction.
 *
 * One Immich person is one contact: the unique index on `immich_person_id` decides, and a write
 * it refuses comes back as `taken` — the race between two members linking the same face ends
 * in a refusal the member can read, never in a server error.
 */

/** SQLite's answer when the unique index on the Immich person refuses a row. */
function isPersonTaken(error: unknown): boolean {
	return (
		error instanceof Error &&
		'code' in error &&
		error.code === 'SQLITE_CONSTRAINT_UNIQUE' &&
		error.message.includes('immich_link.immich_person_id')
	);
}

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

		async linkedContactIdsVisibleTo(viewer: Viewer): Promise<Set<string>> {
			const rows = db
				.select({ contactId: immichLink.contactId })
				.from(immichLink)
				.innerJoin(contact, eq(immichLink.contactId, contact.id))
				.where(contactVisibleTo(viewer))
				.all();
			return new Set(rows.map((row) => row.contactId));
		},

		async holdersOf(
			viewer: Viewer,
			immichPersonIds: readonly string[]
		): Promise<Map<string, ImmichHolder>> {
			const holders = new Map<string, ImmichHolder>();
			if (immichPersonIds.length === 0) return holders;
			// Read unscoped on purpose: a face held by a contact the viewer cannot see is still
			// taken. What the viewer may learn about that contact is decided per row below, by the
			// central rule — nothing more than that it exists.
			const rows = db
				.select({
					immichPersonId: immichLink.immichPersonId,
					contactId: contact.id,
					displayName: contact.displayName,
					householdId: contact.householdId,
					ownerId: contact.createdBy,
					visibility: contact.visibility
				})
				.from(immichLink)
				.innerJoin(contact, eq(immichLink.contactId, contact.id))
				.where(inArray(immichLink.immichPersonId, [...immichPersonIds]))
				.all();
			for (const row of rows) {
				const visible = canViewContact(viewer, row);
				holders.set(row.immichPersonId, {
					contactId: row.contactId,
					name: visible ? row.displayName : null
				});
			}
			return holders;
		},

		async save(link: ImmichLink, audit: NewActivityEntry): Promise<'saved' | 'taken'> {
			try {
				db.transaction((tx) => {
					tx.insert(immichLink)
						.values(link)
						.onConflictDoUpdate({
							target: immichLink.contactId,
							set: {
								immichPersonId: link.immichPersonId,
								linkedBy: link.linkedBy,
								linkedAt: link.linkedAt
							}
						})
						.run();
					tx.insert(activityLog).values(audit).run();
				});
				return 'saved';
			} catch (error) {
				if (isPersonTaken(error)) return 'taken';
				throw error;
			}
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
