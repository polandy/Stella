import { and, eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { Viewer } from '../access/visibility';
import type { ImmichNameIgnore, ImmichNameIgnoreRepository } from '../domain/immich/name-ignores';
import type * as schema from './schema';
import { immichNameIgnore } from './schema';

/*
 * Drizzle adapter for the ImmichNameIgnoreRepository port (docs/08 §8.3). An ignored face of
 * *New from Immich* names no contact, so there is no contact visibility to check: it is the
 * household's, and every read and removal is held to the viewer's household — the scoping the
 * access layer gives household data (docs/03 §3.7). A face ignored twice keeps its first record.
 */
export function createDrizzleImmichNameIgnoreRepository(
	db: BunSQLiteDatabase<typeof schema>
): ImmichNameIgnoreRepository {
	return {
		async listForHousehold(viewer: Viewer): Promise<ImmichNameIgnore[]> {
			return db
				.select({
					householdId: immichNameIgnore.householdId,
					immichPersonId: immichNameIgnore.immichPersonId,
					ignoredBy: immichNameIgnore.ignoredBy,
					ignoredAt: immichNameIgnore.ignoredAt
				})
				.from(immichNameIgnore)
				.where(eq(immichNameIgnore.householdId, viewer.householdId))
				.orderBy(immichNameIgnore.ignoredAt, immichNameIgnore.immichPersonId)
				.all();
		},

		async save(ignore: ImmichNameIgnore): Promise<void> {
			db.insert(immichNameIgnore).values(ignore).onConflictDoNothing().run();
		},

		async remove(viewer: Viewer, immichPersonId: string): Promise<boolean> {
			const removed = db
				.delete(immichNameIgnore)
				.where(
					and(
						eq(immichNameIgnore.householdId, viewer.householdId),
						eq(immichNameIgnore.immichPersonId, immichPersonId)
					)
				)
				.returning({ immichPersonId: immichNameIgnore.immichPersonId })
				.all();
			return removed.length > 0;
		}
	};
}
