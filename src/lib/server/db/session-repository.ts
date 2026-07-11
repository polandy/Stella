import { eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { SessionRecord, SessionRepository } from '../auth/session';
import type * as schema from './schema';
import { session as sessionTable } from './schema';

/*
 * Drizzle adapter implementing the auth SessionRepository port over the `session` table
 * (docs/08 §8.3). This is the concrete infrastructure; the domain depends only on the port.
 */

export function createDrizzleSessionRepository(
	db: BunSQLiteDatabase<typeof schema>
): SessionRepository {
	return {
		async create(session: SessionRecord) {
			db.insert(sessionTable)
				.values({ id: session.id, userId: session.userId, expiresAt: session.expiresAt })
				.run();
		},

		async findById(id: string) {
			const row = db
				.select({
					id: sessionTable.id,
					userId: sessionTable.userId,
					expiresAt: sessionTable.expiresAt
				})
				.from(sessionTable)
				.where(eq(sessionTable.id, id))
				.get();
			return row ?? null;
		},

		async updateExpiry(id: string, expiresAt: number) {
			db.update(sessionTable).set({ expiresAt }).where(eq(sessionTable.id, id)).run();
		},

		async delete(id: string) {
			db.delete(sessionTable).where(eq(sessionTable.id, id)).run();
		}
	};
}
