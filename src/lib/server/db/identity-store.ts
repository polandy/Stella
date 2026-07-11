import { and, eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { Role } from '../auth/accounts';
import type { IdentityStore } from '../auth/oidc/login';
import type { IdGenerator } from '../id';
import type * as schema from './schema';
import { household as householdTable, identity as identityTable, user as userTable } from './schema';

/*
 * Drizzle adapter for the OIDC IdentityStore port (docs/02 §2.1.2, docs/08 §8.3). Maps
 * federated identities to users and provisions/links them. If no household exists yet, the
 * first SSO user bootstraps it and becomes admin so the household always has one.
 */

export function createDrizzleIdentityStore(
	db: BunSQLiteDatabase<typeof schema>,
	ids: IdGenerator,
	provider: string
): IdentityStore {
	return {
		async findUserIdByIssuerSubject(issuer, subject) {
			const row = db
				.select({ userId: identityTable.userId })
				.from(identityTable)
				.where(and(eq(identityTable.issuer, issuer), eq(identityTable.subject, subject)))
				.get();
			return row?.userId ?? null;
		},

		async findUserIdByEmail(email) {
			const row = db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, email)).get();
			return row?.id ?? null;
		},

		async provision({ issuer, subject, email, name, role }) {
			return db.transaction((tx) => {
				const existingHousehold = tx.select({ id: householdTable.id }).from(householdTable).limit(1).get();

				let householdId: string;
				let effectiveRole: Role = role;
				if (!existingHousehold) {
					householdId = ids.next();
					tx.insert(householdTable).values({ id: householdId, name: 'Household' }).run();
					effectiveRole = 'admin'; // the first SSO user bootstraps the household
				} else {
					householdId = existingHousehold.id;
				}

				const userId = ids.next();
				tx.insert(userTable)
					.values({ id: userId, householdId, email, name, role: effectiveRole, passwordHash: null })
					.run();
				tx.insert(identityTable)
					.values({ id: ids.next(), userId, provider, issuer, subject, emailAtLink: email })
					.run();
				return userId;
			});
		},

		async linkIdentity(userId, { issuer, subject, email }) {
			db.insert(identityTable)
				.values({ id: ids.next(), userId, provider, issuer, subject, emailAtLink: email })
				.run();
		},

		async updateRoleAndProfile(userId, { role, profile }) {
			const patch: { role?: Role; name?: string; email?: string } = {};
			if (role) patch.role = role;
			if (profile) {
				patch.name = profile.name;
				patch.email = profile.email;
			}
			if (Object.keys(patch).length > 0) {
				db.update(userTable).set(patch).where(eq(userTable.id, userId)).run();
			}
		},

		async touchIdentity(issuer, subject, at) {
			db.update(identityTable)
				.set({ lastLoginAt: at })
				.where(and(eq(identityTable.issuer, issuer), eq(identityTable.subject, subject)))
				.run();
		}
	};
}
