import { and, eq, or, sql } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { alias } from 'drizzle-orm/sqlite-core';
import { contactBrowsableBy, contactColumnsVisibleTo } from '../access/query-scoping';
import type { Viewer } from '../access/visibility';
import type { NameCandidate, NameCandidateSource } from '../domain/contacts/suggestions';
import type * as schema from './schema';
import { contact as contactTable, relationship } from './schema';

/*
 * Drizzle adapter for quick-add's name candidates (docs/02 §2.2.1, docs/08 §8.3): the browsable
 * people with how well connected each is, counted over links the viewer may see.
 */

export function createDrizzleNameCandidateReads(
	db: BunSQLiteDatabase<typeof schema>
): NameCandidateSource {
	return {
		async listNameCandidatesVisibleTo(viewer: Viewer): Promise<NameCandidate[]> {
			// Count only relationships whose other end the viewer may see, so a private
			// person never shows up as "well connected" through someone else's link.
			const other = alias(contactTable, 'other');
			const visibleLinks = db
				.select({ n: sql<number>`count(*)` })
				.from(relationship)
				.innerJoin(
					other,
					eq(
						other.id,
						sql`case when ${relationship.fromContactId} = ${contactTable.id} then ${relationship.toContactId} else ${relationship.fromContactId} end`
					)
				)
				.where(
					and(
						or(
							eq(relationship.fromContactId, contactTable.id),
							eq(relationship.toContactId, contactTable.id)
						),
						contactColumnsVisibleTo(viewer, other)
					)
				);
			return db
				.select({
					id: contactTable.id,
					displayName: contactTable.displayName,
					firstName: contactTable.firstName,
					lastName: contactTable.lastName,
					relationshipCount: sql<number>`(${visibleLinks})`.mapWith(Number)
				})
				.from(contactTable)
				.where(contactBrowsableBy(viewer))
				.orderBy(contactTable.displayName)
				.all();
		}
	};
}
