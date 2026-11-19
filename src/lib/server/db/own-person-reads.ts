import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { isMemberAccount } from '../access/query-scoping';
import type { OwnPersonReads } from '../domain/shared/idea-on-person';
import type * as schema from './schema';
import { user } from './schema';

/*
 * Drizzle adapter for the OwnPersonReads port: which current member's own person a person is
 * (docs/dev/03 §3.7), the one fact a gift idea, an outing and a to-do ask to keep a surprise.
 */

export function createDrizzleOwnPersonReads(db: BunSQLiteDatabase<typeof schema>): OwnPersonReads {
	return {
		async memberWhoseOwnPerson(householdId, contactId) {
			const row = db
				.select({ id: user.id })
				.from(user)
				.where(
					and(
						eq(user.householdId, householdId),
						eq(user.selfContactId, contactId),
						isNull(user.removedAt),
						isMemberAccount()
					)
				)
				.get();
			return row?.id ?? null;
		},

		async membersOwnPeople(householdId) {
			const rows = db
				.select({ memberId: user.id, contactId: user.selfContactId })
				.from(user)
				.where(
					and(
						eq(user.householdId, householdId),
						isNotNull(user.selfContactId),
						isNull(user.removedAt),
						isMemberAccount()
					)
				)
				.all();
			return rows.flatMap(({ memberId, contactId }) =>
				contactId === null ? [] : [{ memberId, contactId }]
			);
		}
	};
}
