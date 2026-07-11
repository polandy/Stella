import { count, eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { AccountRepository, AuthUser, StoredCredentials } from '../auth/accounts';
import type * as schema from './schema';
import { household as householdTable, user as userTable } from './schema';

/*
 * Drizzle adapter implementing the auth AccountRepository port over the `user` and
 * `household` tables (docs/08 §8.3). Infrastructure only; the domain depends on the port.
 */

const toAuthUser = (row: {
	id: string;
	householdId: string;
	email: string;
	name: string;
	role: 'admin' | 'member';
}): AuthUser => ({
	id: row.id,
	householdId: row.householdId,
	email: row.email,
	name: row.name,
	role: row.role
});

export function createDrizzleAccountRepository(
	db: BunSQLiteDatabase<typeof schema>
): AccountRepository {
	return {
		async countUsers() {
			const row = db.select({ value: count() }).from(userTable).get();
			return row?.value ?? 0;
		},

		async findCredentialsByEmail(email: string): Promise<StoredCredentials | null> {
			const row = db
				.select({
					id: userTable.id,
					householdId: userTable.householdId,
					email: userTable.email,
					name: userTable.name,
					role: userTable.role,
					passwordHash: userTable.passwordHash
				})
				.from(userTable)
				.where(eq(userTable.email, email))
				.get();
			if (!row) return null;
			return { user: toAuthUser(row), passwordHash: row.passwordHash };
		},

		async findById(id: string): Promise<AuthUser | null> {
			const row = db
				.select({
					id: userTable.id,
					householdId: userTable.householdId,
					email: userTable.email,
					name: userTable.name,
					role: userTable.role
				})
				.from(userTable)
				.where(eq(userTable.id, id))
				.get();
			return row ? toAuthUser(row) : null;
		},

		async insertHouseholdWithAdmin(data) {
			db.transaction((tx) => {
				tx.insert(householdTable).values({ id: data.household.id, name: data.household.name }).run();
				tx.insert(userTable)
					.values({
						id: data.user.id,
						householdId: data.user.householdId,
						email: data.user.email,
						name: data.user.name,
						passwordHash: data.user.passwordHash,
						role: data.user.role,
						roleLocked: data.user.roleLocked
					})
					.run();
			});
		}
	};
}
