import { eq, sql, type SQLWrapper } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { alias } from 'drizzle-orm/sqlite-core';
import {
	circleColumnsVisibleTo,
	contactBrowsableBy,
	membershipVisibleTo,
	relationshipVisibleTo
} from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { PeopleStampReads } from '../domain/contacts/people-stamp';
import type * as schema from './schema';
import { circle, circleMembership, contact, relationship, relationshipType } from './schema';

/*
 * Drizzle adapter for the people stamp's markers (docs/04 §4.9). One statement of aggregates,
 * one value per table whatever the size of the household. `total()` beside `max()` catches a
 * change to a row that is not the latest one; `count()` catches an insert or a delete.
 */

/** How many rows, and the latest and the sum of their change times, as one value. */
const changesOf = (updatedAt: SQLWrapper) =>
	sql<string>`count(*) || ':' || coalesce(max(${updatedAt}), '') || ':' || total(${updatedAt})`;

export function createDrizzlePeopleStampReads(
	db: BunSQLiteDatabase<typeof schema>
): PeopleStampReads {
	return {
		async markersVisibleTo(viewer: Viewer): Promise<string> {
			// The people the shell lists. Setting an avatar does not stamp `updated_at`, so the
			// avatars are carried as they are.
			const people = db
				.select({
					marker: sql<string>`count(*) || ':' || coalesce(max(${contact.updatedAt}), '') || ':' || total(${contact.updatedAt}) || ':' || coalesce(group_concat(${contact.avatarPhotoId}), '')`
				})
				.from(contact)
				.where(contactBrowsableBy(viewer));

			const fromC = alias(contact, 'from_c');
			const toC = alias(contact, 'to_c');
			const links = db
				.select({
					marker: changesOf(relationship.updatedAt)
				})
				.from(relationship)
				.innerJoin(fromC, eq(relationship.fromContactId, fromC.id))
				.innerJoin(toC, eq(relationship.toContactId, toC.id))
				.where(relationshipVisibleTo(viewer, fromC, toC));

			// A household's own types can be relabelled, and the type table keeps no time.
			const types = db
				.select({
					marker: sql<
						string | null
					>`group_concat(${relationshipType.id} || ':' || ${relationshipType.forwardLabel} || ':' || ${relationshipType.reverseLabel} || ':' || ${relationshipType.category} || ':' || ${relationshipType.sortOrder}, '|')`
				})
				.from(relationshipType)
				.where(eq(relationshipType.householdId, viewer.householdId));

			// A circle's name, dates, parent and archiving all reach the context line.
			const circles = db
				.select({
					marker: sql<
						string | null
					>`group_concat(${circle.id} || ':' || ${circle.name} || ':' || coalesce(${circle.parentCircleId}, '') || ':' || coalesce(${circle.startDate}, '') || ':' || coalesce(${circle.endDate}, '') || ':' || coalesce(${circle.archivedAt}, '') || ':' || ${circle.updatedAt}, '|')`
				})
				.from(circle)
				.where(circleColumnsVisibleTo(viewer, circle));

			const memberships = db
				.select({
					marker: changesOf(circleMembership.updatedAt)
				})
				.from(circleMembership)
				.innerJoin(circle, eq(circleMembership.circleId, circle.id))
				.innerJoin(contact, eq(circleMembership.contactId, contact.id))
				.where(membershipVisibleTo(viewer, circle, contact));

			// One statement: each read above is a scalar subquery of it.
			const [row] = db.values<(string | null)[]>(
				sql`select (${people}), (${links}), (${types}), (${circles}), (${memberships})`
			);
			return JSON.stringify(row);
		}
	};
}
