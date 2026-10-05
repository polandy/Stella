import { and, eq, inArray } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { contactVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { ImmichIgnore, ImmichIgnoreRepository } from '../domain/immich/ignores';
import type * as schema from './schema';
import { contact, immichIgnore } from './schema';

/*
 * Drizzle adapter for the ImmichIgnoreRepository port (docs/08 §8.3). An ignored pair has no
 * visibility of its own: reads and removals join the contact and are scoped through the central
 * `contactVisibleTo`, like a link (docs/concepts/immich.md §5). A pair ignored twice keeps its
 * first record — who said so first, and when.
 */
export function createDrizzleImmichIgnoreRepository(db: BunSQLiteDatabase<typeof schema>): ImmichIgnoreRepository {
	return {
		async listVisibleTo(viewer: Viewer): Promise<ImmichIgnore[]> {
			return db
				.select({
					contactId: immichIgnore.contactId,
					immichPersonId: immichIgnore.immichPersonId,
					ignoredBy: immichIgnore.ignoredBy,
					ignoredAt: immichIgnore.ignoredAt
				})
				.from(immichIgnore)
				.innerJoin(contact, eq(immichIgnore.contactId, contact.id))
				.where(contactVisibleTo(viewer))
				.orderBy(immichIgnore.ignoredAt, immichIgnore.contactId, immichIgnore.immichPersonId)
				.all();
		},

		async save(ignores: readonly ImmichIgnore[]): Promise<void> {
			if (ignores.length === 0) return;
			db.insert(immichIgnore).values([...ignores]).onConflictDoNothing().run();
		},

		async remove(viewer: Viewer, contactId: string, immichPersonId: string): Promise<boolean> {
			const visible = db.select({ id: contact.id }).from(contact).where(and(eq(contact.id, contactId), contactVisibleTo(viewer)));
			const removed = db
				.delete(immichIgnore)
				.where(
					and(
						eq(immichIgnore.contactId, contactId),
						eq(immichIgnore.immichPersonId, immichPersonId),
						inArray(immichIgnore.contactId, visible)
					)
				)
				.returning({ contactId: immichIgnore.contactId })
				.all();
			return removed.length > 0;
		}
	};
}
