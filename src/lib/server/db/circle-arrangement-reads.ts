import { and, eq, inArray } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { contactVisibleTo, membershipVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { CircleArrangementReads } from '../domain/circles/arrange-people';
import type * as schema from './schema';
import { circle, circleMembership, contact } from './schema';

/*
 * Drizzle adapter for what the arrange screen reads (docs/08 §8.3): the people directly in a set
 * of circles, scoped by `membershipVisibleTo` — a membership shows only when its circle AND its
 * contact are visible (§3.7).
 */

export function createDrizzleCircleArrangementReads(
	db: BunSQLiteDatabase<typeof schema>
): CircleArrangementReads {
	return {
		async listMembersOfVisibleTo(viewer: Viewer, circleIds: readonly string[]) {
			if (circleIds.length === 0) return [];
			return db
				.select({
					circleId: circleMembership.circleId,
					contactId: contact.id,
					displayName: contact.displayName,
					avatarPhotoId: contact.avatarPhotoId,
					role: circleMembership.role,
					startDate: circleMembership.startDate,
					endDate: circleMembership.endDate,
					note: circleMembership.note
				})
				.from(circleMembership)
				.innerJoin(circle, eq(circleMembership.circleId, circle.id))
				.innerJoin(contact, eq(circleMembership.contactId, contact.id))
				.where(
					and(
						inArray(circleMembership.circleId, [...circleIds]),
						membershipVisibleTo(viewer, circle, contact)
					)
				)
				.orderBy(contact.displayName, contact.id)
				.all();
		},

		async visibleContactIdsAmong(viewer: Viewer, contactIds: readonly string[]) {
			if (contactIds.length === 0) return new Set<string>();
			const rows = db
				.select({ id: contact.id })
				.from(contact)
				.where(and(inArray(contact.id, [...contactIds]), contactVisibleTo(viewer)))
				.all();
			return new Set(rows.map((r) => r.id));
		}
	};
}
