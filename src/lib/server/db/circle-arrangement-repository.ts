import { and, eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type {
	AddedMembership,
	CircleArrangementRepository,
	MembershipSnapshot,
	RevertOutcome
} from '../domain/circles/arrange-people';
import type * as schema from './schema';
import { circle, circleMembership, user } from './schema';

/*
 * Drizzle adapter for the arrangement's writes (docs/08 §8.3, ADR-127): each of `arrange` and
 * `revert` is one transaction, so a batch lands whole or not at all. What is deleted is read
 * back first, in the same transaction, so the receipt holds the rows as they really were.
 */

export function createDrizzleCircleArrangementRepository(
	db: BunSQLiteDatabase<typeof schema>
): CircleArrangementRepository {
	return {
		async arrange(plan) {
			return db.transaction((tx) => {
				const at = (circleId: string, contactId: string) =>
					and(eq(circleMembership.circleId, circleId), eq(circleMembership.contactId, contactId));

				const removed: MembershipSnapshot[] = [];
				for (const r of plan.removals) {
					removed.push(
						...tx.select().from(circleMembership).where(at(r.circleId, r.contactId)).all()
					);
					tx.delete(circleMembership).where(at(r.circleId, r.contactId)).run();
				}

				const added: AddedMembership[] = [];
				for (const a of plan.adds) {
					// Decided here, inside the transaction: someone may have added the person meanwhile.
					const there = tx
						.select({ id: circleMembership.id })
						.from(circleMembership)
						.where(at(a.circleId, a.contactId))
						.get();
					if (there) continue;
					tx.insert(circleMembership).values(a).run();
					added.push({
						id: a.id,
						circleId: a.circleId,
						contactId: a.contactId,
						role: a.role,
						startDate: a.startDate,
						endDate: a.endDate,
						note: a.note,
						updatedAt: a.updatedAt
					});
				}
				return { added, removed };
			});
		},

		async revert(plan) {
			return db.transaction((tx) => {
				const outcome: RevertOutcome = { removed: 0, kept: 0, restored: 0, conflicts: 0 };

				for (const a of plan.added) {
					const row = tx.select().from(circleMembership).where(eq(circleMembership.id, a.id)).get();
					if (!row) continue; // already gone: nothing to take back
					const pristine =
						row.circleId === a.circleId &&
						row.contactId === a.contactId &&
						row.role === a.role &&
						row.updatedAt === a.updatedAt &&
						row.startDate === a.startDate &&
						row.endDate === a.endDate &&
						row.note === a.note;
					if (!pristine) {
						outcome.kept += 1;
						continue;
					}
					tx.delete(circleMembership).where(eq(circleMembership.id, a.id)).run();
					outcome.removed += 1;
				}

				for (const r of plan.removed) {
					const ownCircle = tx
						.select({ id: circle.id })
						.from(circle)
						.where(and(eq(circle.id, r.circleId), eq(circle.householdId, plan.householdId)))
						.get();
					const back = tx
						.select({ id: circleMembership.id })
						.from(circleMembership)
						.where(
							and(
								eq(circleMembership.circleId, r.circleId),
								eq(circleMembership.contactId, r.contactId)
							)
						)
						.get();
					if (!ownCircle || back) {
						outcome.conflicts += 1;
						continue;
					}
					// The author stays when they are still one of the household, else the restorer is.
					const author = tx
						.select({ id: user.id })
						.from(user)
						.where(and(eq(user.id, r.createdBy), eq(user.householdId, plan.householdId)))
						.get();
					tx.insert(circleMembership)
						.values({ ...r, createdBy: author ? r.createdBy : plan.restoredBy })
						.run();
					outcome.restored += 1;
				}
				return outcome;
			});
		}
	};
}
