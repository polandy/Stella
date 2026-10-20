import { and, eq, inArray, sql } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { circleColumnsVisibleTo } from '../access/query-scoping';
import type { Remover, Viewer } from '../access/visibility';
import type { ActivityOf } from '../domain/activity/activity';
import type {
	Circle,
	CircleDetails,
	CircleRepository,
	NewCircle,
	NewMembership,
	RoleRename
} from '../domain/circles/circles';
import { circleColumns, toCircle } from './circle-columns';
import { deleteDeletableCircle, readCircleDeletion } from './circle-deletion';
import type * as schema from './schema';
import { circle, circleMembership, photo } from './schema';

/*
 * Drizzle adapter for the CircleRepository port (docs/08 §8.3): a circle's writes and the
 * one-circle reads they rest on, scoped centrally via `circleColumnsVisibleTo` (§3.7). The lists
 * are read models of their own (`circle-directory-reads.ts`, `circle-membership-reads.ts`);
 * deleting a circle lives in `circle-deletion.ts`.
 */

export function createDrizzleCircleRepository(
	db: BunSQLiteDatabase<typeof schema>
): CircleRepository {
	return {
		async insert(c: NewCircle) {
			db.insert(circle)
				.values({
					id: c.id,
					householdId: c.householdId,
					createdBy: c.createdBy,
					visibility: c.visibility,
					name: c.name,
					description: c.description,
					kind: c.kind,
					color: c.color,
					parentCircleId: c.parentCircleId,
					startDate: c.startDate,
					endDate: c.endDate,
					createdAt: c.createdAt,
					updatedAt: c.updatedAt
				})
				.run();
		},

		// The SQL spelling of `circleNameKey` (src/lib/circles/name-key.ts) — keep the two in step.
		async findByNameVisibleTo(viewer: Viewer, name: string): Promise<Circle | null> {
			const row = db
				.select(circleColumns)
				.from(circle)
				.where(
					and(
						sql`lower(${circle.name}) = ${name.toLowerCase()}`,
						circleColumnsVisibleTo(viewer, circle)
					)
				)
				.get();
			return row ? toCircle(row) : null;
		},

		async getVisibleTo(viewer: Viewer, circleId: string): Promise<Circle | null> {
			const row = db
				.select(circleColumns)
				.from(circle)
				.where(and(eq(circle.id, circleId), circleColumnsVisibleTo(viewer, circle)))
				.get();
			return row ? toCircle(row) : null;
		},

		async addMemberships(memberships: readonly NewMembership[]): Promise<void> {
			if (memberships.length === 0) return;
			db.transaction((tx) => {
				for (const m of memberships) {
					const existing = tx
						.select({ id: circleMembership.id })
						.from(circleMembership)
						.where(
							and(
								eq(circleMembership.circleId, m.circleId),
								eq(circleMembership.contactId, m.contactId)
							)
						)
						.get();
					if (existing) continue;
					tx.insert(circleMembership)
						.values({
							id: m.id,
							circleId: m.circleId,
							contactId: m.contactId,
							role: m.role,
							createdBy: m.createdBy,
							createdAt: m.createdAt,
							updatedAt: m.updatedAt
						})
						.run();
				}
			});
		},

		async removeMembership(circleId: string, contactId: string) {
			db.delete(circleMembership)
				.where(
					and(eq(circleMembership.circleId, circleId), eq(circleMembership.contactId, contactId))
				)
				.run();
		},

		async setRoles(
			circleId: string,
			contactIds: readonly string[],
			role: string | null,
			updatedAt: number
		) {
			if (contactIds.length === 0) return;
			db.update(circleMembership)
				.set({ role, updatedAt })
				.where(
					and(
						eq(circleMembership.circleId, circleId),
						inArray(circleMembership.contactId, [...contactIds])
					)
				)
				.run();
		},

		// Scoped by the visibility rule in the write itself, so nothing slips between a read and it.
		// The Bun driver types `run()` as void, so the changed row is counted through `returning()`.
		async update(viewer: Viewer, circleId: string, details: CircleDetails, updatedAt: number) {
			const changed = db
				.update(circle)
				.set({ ...details, updatedAt })
				.where(and(eq(circle.id, circleId), circleColumnsVisibleTo(viewer, circle)))
				.returning({ id: circle.id })
				.all();
			return changed.length > 0;
		},

		// Scoped like `update`: the move itself is checked by `planCircleMove` before it is asked for.
		async setParent(viewer: Viewer, circleId: string, parentId: string | null, updatedAt: number) {
			const changed = db
				.update(circle)
				.set({ parentCircleId: parentId, updatedAt })
				.where(and(eq(circle.id, circleId), circleColumnsVisibleTo(viewer, circle)))
				.returning({ id: circle.id })
				.all();
			return changed.length > 0;
		},

		async readDeletion(remover: Remover, circleId: string) {
			return readCircleDeletion(db, remover, circleId);
		},

		async deleteDeletable(remover: Remover, circleId: string, audit: ActivityOf<'circle.deleted'>) {
			return deleteDeletableCircle(db, remover, circleId, audit);
		},

		// The photos are `photo` rows of this circle (docs/03 §photo): a role lives on both
		// tables, and one transaction keeps a role's people and its banner under one name.
		async renameRole(change: RoleRename) {
			db.transaction((tx) => {
				if (change.contactIds.length > 0) {
					tx.update(circleMembership)
						.set({ role: change.role, updatedAt: change.updatedAt })
						.where(
							and(
								eq(circleMembership.circleId, change.circleId),
								inArray(circleMembership.contactId, [...change.contactIds])
							)
						)
						.run();
				}
				if (change.photoIds.length > 0) {
					tx.update(photo)
						.set({ circleRole: change.role })
						.where(
							and(eq(photo.circleId, change.circleId), inArray(photo.id, [...change.photoIds]))
						)
						.run();
				}
			});
		}
	};
}
