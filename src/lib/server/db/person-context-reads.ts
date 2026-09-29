import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { alias } from 'drizzle-orm/sqlite-core';
import { membershipVisibleTo, relationshipVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type {
	ContextMembershipRow,
	ContextTieRow,
	PersonContextReads
} from '../domain/contacts/person-context';
import type * as schema from './schema';
import { circle, circleMembership, contact, relationship, relationshipType } from './schema';

/*
 * Drizzle adapter for the reads behind a namesake's context line (docs/02 §2.2.3). A link is
 * scoped through `relationshipVisibleTo` (both ends visible), a membership through
 * `membershipVisibleTo` (circle and contact visible), so nothing the viewer may not open is
 * ever handed to the browser.
 */

export function createDrizzlePersonContextReads(db: BunSQLiteDatabase<typeof schema>): PersonContextReads {
	return {
		async listTiesOfVisibleTo(viewer: Viewer, contactIds: readonly string[]): Promise<ContextTieRow[]> {
			if (contactIds.length === 0) return [];
			const fromC = alias(contact, 'from_c');
			const toC = alias(contact, 'to_c');
			const rows = db
				.select({
					fromContactId: relationship.fromContactId,
					toContactId: relationship.toContactId,
					fromName: fromC.displayName,
					toName: toC.displayName,
					status: relationship.status,
					createdAt: relationship.createdAt,
					typeKey: relationshipType.key,
					forwardLabel: relationshipType.forwardLabel,
					reverseLabel: relationshipType.reverseLabel,
					category: relationshipType.category,
					sortOrder: relationshipType.sortOrder
				})
				.from(relationship)
				.innerJoin(relationshipType, eq(relationship.typeId, relationshipType.id))
				.innerJoin(fromC, eq(relationship.fromContactId, fromC.id))
				.innerJoin(toC, eq(relationship.toContactId, toC.id))
				.where(
					and(
						or(
							inArray(relationship.fromContactId, [...contactIds]),
							inArray(relationship.toContactId, [...contactIds])
						),
						relationshipVisibleTo(viewer, fromC, toC)
					)
				)
				.all();

			const listed = new Set(contactIds);
			const ties: ContextTieRow[] = [];
			for (const row of rows) {
				const shared = {
					typeKey: row.typeKey,
					category: row.category,
					sortOrder: row.sortOrder,
					status: row.status,
					createdAt: row.createdAt
				};
				// Both ends may be listed (two namesakes linked to each other): one row each.
				if (listed.has(row.fromContactId))
					ties.push({
						...shared,
						contactId: row.fromContactId,
						side: 'forward',
						label: row.forwardLabel,
						otherId: row.toContactId,
						otherName: row.toName
					});
				if (listed.has(row.toContactId))
					ties.push({
						...shared,
						contactId: row.toContactId,
						side: 'reverse',
						label: row.reverseLabel,
						otherId: row.fromContactId,
						otherName: row.fromName
					});
			}
			return ties;
		},

		async listMembershipsOfVisibleTo(
			viewer: Viewer,
			contactIds: readonly string[]
		): Promise<ContextMembershipRow[]> {
			if (contactIds.length === 0) return [];
			return db
				.select({
					contactId: circleMembership.contactId,
					circleId: circle.id,
					parentCircleId: circle.parentCircleId,
					name: circle.name,
					role: circleMembership.role,
					// A membership that says nothing of its own dates holds for as long as the circle does.
					startDate: sql<string | null>`coalesce(${circleMembership.startDate}, ${circle.startDate})`,
					endDate: sql<string | null>`coalesce(${circleMembership.endDate}, ${circle.endDate})`
				})
				.from(circleMembership)
				.innerJoin(circle, eq(circleMembership.circleId, circle.id))
				.innerJoin(contact, eq(circleMembership.contactId, contact.id))
				.where(
					and(
						inArray(circleMembership.contactId, [...contactIds]),
						isNull(circle.archivedAt),
						membershipVisibleTo(viewer, circle, contact)
					)
				)
				.all();
		}
	};
}
