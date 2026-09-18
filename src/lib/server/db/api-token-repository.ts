import { and, desc, eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { ApiTokenRecord, ApiTokenRepository } from '../auth/api-tokens';
import type * as schema from './schema';
import { apiToken } from './schema';

/*
 * Drizzle adapter for the ApiTokenRepository port (docs/02 §2.16.1). Every write that names a
 * token by id also names its member, so one member can never withdraw another's token.
 */

/** Build the ApiTokenRepository adapter over a Drizzle handle. */
export function createDrizzleApiTokenRepository(
	db: BunSQLiteDatabase<typeof schema>
): ApiTokenRepository {
	return {
		async insert(record: ApiTokenRecord) {
			db.insert(apiToken).values(record).run();
		},

		async findByHash(tokenHash: string) {
			return db.select().from(apiToken).where(eq(apiToken.tokenHash, tokenHash)).get() ?? null;
		},

		async listForUser(userId: string) {
			return db
				.select()
				.from(apiToken)
				.where(eq(apiToken.userId, userId))
				.orderBy(desc(apiToken.createdAt))
				.all();
		},

		async deleteForUser(userId: string, id: string) {
			const gone = db
				.delete(apiToken)
				.where(and(eq(apiToken.id, id), eq(apiToken.userId, userId)))
				.returning({ id: apiToken.id })
				.all();
			return gone.length > 0;
		},

		async touch(id: string, at: number) {
			db.update(apiToken).set({ lastUsedAt: at }).where(eq(apiToken.id, id)).run();
		}
	};
}
