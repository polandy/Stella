import { and, eq } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { membershipVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type {
	CircleColor,
	CircleRoleUse,
	ContactCircleView,
	MemberView
} from '../domain/circles/circles';
import type { CircleMembershipReads } from '../domain/circles/memberships';
import type * as schema from './schema';
import { circle, circleMembership, contact } from './schema';

/*
 * Drizzle adapter for who is in which circle (docs/08 §8.3). Every read is scoped by
 * `membershipVisibleTo`: a membership is visible only when its circle AND its contact are (§3.7).
 */

export function createDrizzleCircleMembershipReads(
	db: BunSQLiteDatabase<typeof schema>
): CircleMembershipReads {
	return {
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
				.where(
					and(eq(circleMembership.circleId, circleId), membershipVisibleTo(viewer, circle, contact))
				)
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
				.where(
					and(
						eq(circleMembership.contactId, contactId),
						membershipVisibleTo(viewer, circle, contact)
					)
				)
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
		},

		async listRoleUsesVisibleTo(viewer: Viewer): Promise<CircleRoleUse[]> {
			return db
				.select({ circleName: circle.name, role: circleMembership.role })
				.from(circleMembership)
				.innerJoin(circle, eq(circleMembership.circleId, circle.id))
				.innerJoin(contact, eq(circleMembership.contactId, contact.id))
				.where(membershipVisibleTo(viewer, circle, contact))
				.orderBy(circle.name, circleMembership.role)
				.all();
		}
	};
}
