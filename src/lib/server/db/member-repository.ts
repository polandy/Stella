import { asc, eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { MemberRepository } from '../domain/household/members';
import { user } from './schema';
import type * as schema from './schema';

/*
 * Drizzle adapter for the MemberRepository port (docs/08 §8.3). It reads the `user` table by
 * household and hands out nothing but id and name — the story needs a name for an author, not
 * an account.
 */
export function createDrizzleMemberRepository(db: BunSQLiteDatabase<typeof schema>): MemberRepository {
	return {
		async listMembers(householdId: string) {
			return db
				.select({ id: user.id, name: user.name })
				.from(user)
				.where(eq(user.householdId, householdId))
				.orderBy(asc(user.name))
				.all();
		}
	};
}
