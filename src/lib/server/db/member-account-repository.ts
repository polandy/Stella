import { and, asc, count, eq, isNull } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { memberRemovableBy } from '../access/query-scoping';
import { activityEntry } from '../domain/activity/activity';
import type { MemberAccountRepository } from '../domain/household/remove-member';
import type * as schema from './schema';
import {
	activityLog,
	apiToken,
	circle,
	contact,
	gift,
	identity,
	interaction,
	invitation,
	journalEntry,
	note,
	photo,
	session,
	user
} from './schema';

/*
 * Drizzle adapter for the MemberAccountRepository port (docs/02 §2.1, docs/08 §8.3). A removal
 * stamps `removed_at` and keeps the row: every `created_by` still names a real author, the
 * identity lets the next SSO sign-in be turned away, and the password hash waits, unchecked,
 * for a restore.
 */

/** Every table a member's private records live in. */
const PRIVATE_CAPABLE: { table: SQLiteTable; createdBy: SQLiteColumn; visibility: SQLiteColumn }[] =
	[contact, note, photo, journalEntry, interaction, gift, circle].map((t) => ({
		table: t,
		createdBy: t.createdBy,
		visibility: t.visibility
	}));

export function createDrizzleMemberAccountRepository(
	db: BunSQLiteDatabase<typeof schema>
): MemberAccountRepository {
	return {
		async listAccounts(householdId) {
			const withSso = new Set(
				db
					.selectDistinct({ userId: identity.userId })
					.from(identity)
					.innerJoin(user, eq(identity.userId, user.id))
					.where(eq(user.householdId, householdId))
					.all()
					.map((r) => r.userId)
			);
			return db
				.select({
					id: user.id,
					name: user.name,
					email: user.email,
					role: user.role,
					passwordHash: user.passwordHash,
					removedAt: user.removedAt
				})
				.from(user)
				.where(eq(user.householdId, householdId))
				.orderBy(asc(user.name))
				.all()
				.map(({ passwordHash, ...account }) => ({
					...account,
					signIn: { password: passwordHash !== null, sso: withSso.has(account.id) }
				}));
		},

		async countPrivateRecords(memberId) {
			return PRIVATE_CAPABLE.reduce((sum, t) => {
				const row = db
					.select({ n: count() })
					.from(t.table)
					.where(and(eq(t.createdBy, memberId), eq(t.visibility, 'private')))
					.get();
				return sum + (row?.n ?? 0);
			}, 0);
		},

		async findRemovableBy(remover, memberId) {
			const row = db
				.select({ id: user.id, name: user.name })
				.from(user)
				.where(and(eq(user.id, memberId), memberRemovableBy(remover)))
				.get();
			return row ?? null;
		},

		async removeRemovableBy(remover, memberId, at, audit) {
			return db.transaction((tx) => {
				const removed = tx
					.update(user)
					.set({ removedAt: at, updatedAt: at })
					.where(and(eq(user.id, memberId), memberRemovableBy(remover)))
					.returning({ id: user.id })
					.all();
				if (removed.length === 0) return false;
				tx.delete(session).where(eq(session.userId, memberId)).run();
				tx.delete(apiToken).where(eq(apiToken.userId, memberId)).run();
				// An open invitation speaks for the household in its author's name; an accepted
				// one is the record of how someone came in.
				tx.delete(invitation)
					.where(and(eq(invitation.createdBy, memberId), isNull(invitation.acceptedAt)))
					.run();
				tx.insert(activityLog).values(activityEntry(audit)).run();
				return true;
			});
		}
	};
}
