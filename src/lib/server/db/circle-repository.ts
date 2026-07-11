import { and, count, eq, sql } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { circleColumnsVisibleTo, contactColumnsVisibleTo, membershipVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type {
	Circle,
	CircleColor,
	CircleRepository,
	CircleWithCount,
	ContactCircleView,
	MemberView,
	NewCircle,
	NewMembership
} from '../domain/circles/circles';
import type * as schema from './schema';
import { circle, circleMembership, contact } from './schema';

/*
 * Drizzle adapter for the CircleRepository port (docs/08 §8.3). All reads are scoped centrally:
 * a circle via `circleColumnsVisibleTo`, a membership via `membershipVisibleTo` (circle AND
 * contact visible, §3.7). Member counts only include members the viewer may see — the contact
 * visibility lives in the JOIN condition so a circle with only hidden members still lists (as 0).
 */

const circleCols = {
	id: circle.id,
	householdId: circle.householdId,
	createdBy: circle.createdBy,
	visibility: circle.visibility,
	name: circle.name,
	description: circle.description,
	kind: circle.kind,
	color: circle.color,
	startDate: circle.startDate,
	endDate: circle.endDate
};

const toCircle = (row: Record<string, unknown>): Circle => ({
	id: row.id as string,
	householdId: row.householdId as string,
	createdBy: row.createdBy as string,
	visibility: row.visibility as 'shared' | 'private',
	name: row.name as string,
	description: (row.description as string | null) ?? null,
	kind: row.kind as Circle['kind'],
	color: row.color as CircleColor,
	startDate: (row.startDate as string | null) ?? null,
	endDate: (row.endDate as string | null) ?? null
});

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
					startDate: c.startDate,
					endDate: c.endDate,
					createdAt: c.createdAt,
					updatedAt: c.updatedAt
				})
				.run();
		},

		async findByNameVisibleTo(viewer: Viewer, name: string): Promise<Circle | null> {
			const row = db
				.select(circleCols)
				.from(circle)
				.where(and(sql`lower(${circle.name}) = ${name.toLowerCase()}`, circleColumnsVisibleTo(viewer, circle)))
				.get();
			return row ? toCircle(row) : null;
		},

		async getVisibleTo(viewer: Viewer, circleId: string): Promise<Circle | null> {
			const row = db
				.select(circleCols)
				.from(circle)
				.where(and(eq(circle.id, circleId), circleColumnsVisibleTo(viewer, circle)))
				.get();
			return row ? toCircle(row) : null;
		},

		async listVisibleTo(viewer: Viewer): Promise<CircleWithCount[]> {
			const rows = db
				.select({ ...circleCols, memberCount: count(contact.id) })
				.from(circle)
				.leftJoin(
					circleMembership,
					eq(circleMembership.circleId, circle.id)
				)
				.leftJoin(
					contact,
					and(eq(contact.id, circleMembership.contactId), contactColumnsVisibleTo(viewer, contact))
				)
				.where(circleColumnsVisibleTo(viewer, circle))
				.groupBy(circle.id)
				.orderBy(circle.name)
				.all();
			return rows.map((r) => ({ ...toCircle(r), memberCount: r.memberCount }));
		},

		async membershipExists(circleId: string, contactId: string): Promise<boolean> {
			const row = db
				.select({ id: circleMembership.id })
				.from(circleMembership)
				.where(and(eq(circleMembership.circleId, circleId), eq(circleMembership.contactId, contactId)))
				.get();
			return row !== undefined && row !== null;
		},

		async addMembership(m: NewMembership) {
			db.insert(circleMembership)
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
		},

		async removeMembership(circleId: string, contactId: string) {
			db.delete(circleMembership)
				.where(and(eq(circleMembership.circleId, circleId), eq(circleMembership.contactId, contactId)))
				.run();
		},

		async listMembersVisibleTo(viewer: Viewer, circleId: string): Promise<MemberView[]> {
			return db
				.select({
					membershipId: circleMembership.id,
					contactId: contact.id,
					displayName: contact.displayName,
					avatarPhotoId: contact.avatarPhotoId,
					role: circleMembership.role
				})
				.from(circleMembership)
				.innerJoin(circle, eq(circleMembership.circleId, circle.id))
				.innerJoin(contact, eq(circleMembership.contactId, contact.id))
				.where(and(eq(circleMembership.circleId, circleId), membershipVisibleTo(viewer, circle, contact)))
				.orderBy(contact.displayName)
				.all();
		},

		async listForContactVisibleTo(viewer: Viewer, contactId: string): Promise<ContactCircleView[]> {
			const rows = db
				.select({
					membershipId: circleMembership.id,
					circleId: circle.id,
					name: circle.name,
					kind: circle.kind,
					color: circle.color,
					role: circleMembership.role
				})
				.from(circleMembership)
				.innerJoin(circle, eq(circleMembership.circleId, circle.id))
				.innerJoin(contact, eq(circleMembership.contactId, contact.id))
				.where(and(eq(circleMembership.contactId, contactId), membershipVisibleTo(viewer, circle, contact)))
				.orderBy(circle.name)
				.all();
			return rows.map((r) => ({
				membershipId: r.membershipId,
				circleId: r.circleId,
				name: r.name,
				kind: r.kind,
				color: r.color as CircleColor,
				role: r.role
			}));
		}
	};
}
