import { and, desc, eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { ApiTokenRecord, ApiTokenRepository, TokenScope } from '../auth/api-tokens';
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

		async listForUser(userId: string, scope: TokenScope) {
			return db
				.select()
				.from(apiToken)
				.where(and(eq(apiToken.userId, userId), eq(apiToken.scope, scope)))
				.orderBy(desc(apiToken.createdAt))
				.all();
		},

		async deleteForUser(userId: string, scope: TokenScope, id: string) {
			const gone = db
				.delete(apiToken)
				.where(and(eq(apiToken.id, id), eq(apiToken.userId, userId), eq(apiToken.scope, scope)))
				.returning({ id: apiToken.id })
				.all();
			return gone.length > 0;
		},

		async deleteScopeForUser(userId: string, scope: TokenScope) {
			const gone = db
				.delete(apiToken)
				.where(and(eq(apiToken.userId, userId), eq(apiToken.scope, scope)))
				.returning({ id: apiToken.id })
				.all();
			return gone.length > 0;
		},

		async replaceForUser(record: ApiTokenRecord) {
			db.transaction((tx) => {
				tx.delete(apiToken)
					.where(and(eq(apiToken.userId, record.userId), eq(apiToken.scope, record.scope)))
					.run();
				tx.insert(apiToken).values(record).run();
			});
		},

		async touch(id: string, at: number) {
			db.update(apiToken).set({ lastUsedAt: at }).where(eq(apiToken.id, id)).run();
		}
	};
}
